import { MediaAssetsRepository, TelegramGeneratedOutputsRepository } from "@curator/db";
import { RealTelegramClient, redactTelegramApiError, type ParsedTelegramMedia } from "@curator/telegram";
import { jsonResponse } from "../http/json";
import { verifyInternalRequest } from "../security/internal-auth";
import { badRequest, methodNotAllowed, parseJsonBody, serverError, unauthorized } from "./response";
import type { Env } from "../types";

type RetryBody = {
  queueId?: unknown;
  generatedOutputId?: unknown;
};

type QueueRow = {
  id: string;
  item_id: string;
  generated_output_id: string;
  route_id: string;
  route_output_id: string;
  language: string;
  final_chat_id: string;
  final_thread_id: number | null;
  status: string;
};

type EnvWithFinalPublish = Env & {
  TELEGRAM_FINAL_PUBLISH_ENABLED?: string;
};

export async function handleInternalTelegramPublishRetry(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed(["POST"], request);
  }

  const auth = verifyInternalRequest(request, env);
  if (!auth.ok) {
    return unauthorized(auth.error, "Internal API authorization failed.", request);
  }

  const parsed = await parseJsonBody<RetryBody>(request);
  if (!parsed.ok) {
    return parsed.response;
  }

  const queueId = readNonEmptyString(parsed.value.queueId);
  const generatedOutputId = readNonEmptyString(parsed.value.generatedOutputId);
  if (!queueId && !generatedOutputId) {
    return badRequest("missing_publish_job", "Provide queueId or generatedOutputId.", request);
  }

  const queueRow = await findQueueRow(env, queueId, generatedOutputId);
  if (!queueRow) {
    return badRequest("publish_job_not_found", "No Telegram publish queue row matched the request.", request);
  }

  if (queueRow.status !== "failed") {
    return badRequest("publish_job_not_retryable", "Only failed Telegram publish jobs can be retried.", request);
  }

  if ((env as EnvWithFinalPublish).TELEGRAM_FINAL_PUBLISH_ENABLED !== "true") {
    return jsonResponse({
      ok: true,
      outcome: "skipped",
      reason: "final_publishing_disabled",
      queueId: queueRow.id,
      generatedOutputId: queueRow.generated_output_id,
      status: queueRow.status
    });
  }

  const botToken = env.TELEGRAM_BOT_TOKEN?.trim();
  if (!botToken) {
    await markQueueFailed(env, queueRow.id, "Telegram bot token is not configured.");
    return jsonResponse({
      ok: false,
      outcome: "failed",
      reason: "missing_bot_token",
      queueId: queueRow.id,
      generatedOutputId: queueRow.generated_output_id
    }, { status: 500 });
  }

  try {
    const generatedOutputsRepository = new TelegramGeneratedOutputsRepository(env.DB);
    const mediaAssetsRepository = new MediaAssetsRepository(env.DB);
    const generatedOutput = await generatedOutputsRepository.findById(queueRow.generated_output_id);
    if (!generatedOutput) {
      await markQueueFailed(env, queueRow.id, "Generated output is missing.");
      return jsonResponse({ ok: false, outcome: "failed", reason: "generated_output_missing", queueId: queueRow.id }, { status: 404 });
    }

    await generatedOutputsRepository.updateStatus(generatedOutput.id, "publishing");
    await markQueuePublishing(env, queueRow.id);

    const media = await mediaForItem(mediaAssetsRepository, generatedOutput.itemId);
    const sent = await new RealTelegramClient({ botToken }).publishFinalMessage({
      chatId: queueRow.final_chat_id,
      ...(queueRow.final_thread_id === null ? {} : { messageThreadId: queueRow.final_thread_id }),
      text: generatedOutput.output.caption,
      ...(media.length === 0 ? {} : { media })
    });

    await markQueuePublished(env, queueRow.id, sent.messageId);
    await generatedOutputsRepository.updateStatus(generatedOutput.id, "published");

    return jsonResponse({
      ok: true,
      outcome: "published",
      queueId: queueRow.id,
      generatedOutputId: generatedOutput.id,
      finalMessageId: sent.messageId
    });
  } catch (error) {
    const message = redactPublishError(error);
    await markQueueFailed(env, queueRow.id, message);
    const generatedOutputsRepository = new TelegramGeneratedOutputsRepository(env.DB);
    await generatedOutputsRepository.updateStatus(queueRow.generated_output_id, "failed", message);
    return serverError("telegram_retry_failed", message, request);
  }
}

async function findQueueRow(env: Env, queueId: string | undefined, generatedOutputId: string | undefined): Promise<QueueRow | null> {
  if (queueId) {
    return env.DB.prepare("SELECT * FROM telegram_publish_queue WHERE id = ? LIMIT 1").bind(queueId).first<QueueRow>();
  }
  return env.DB.prepare("SELECT * FROM telegram_publish_queue WHERE generated_output_id = ? LIMIT 1").bind(generatedOutputId ?? "").first<QueueRow>();
}

async function markQueuePublishing(env: Env, queueId: string): Promise<void> {
  await env.DB.prepare("UPDATE telegram_publish_queue SET status = 'publishing', attempt_count = attempt_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(queueId).run();
}

async function markQueuePublished(env: Env, queueId: string, finalMessageId: string): Promise<void> {
  await env.DB.prepare("UPDATE telegram_publish_queue SET status = 'published', final_message_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(finalMessageId, queueId).run();
}

async function markQueueFailed(env: Env, queueId: string, message: string): Promise<void> {
  await env.DB.prepare("UPDATE telegram_publish_queue SET status = 'failed', last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(message, queueId).run();
}

async function mediaForItem(repository: MediaAssetsRepository, itemId: string): Promise<ParsedTelegramMedia[]> {
  const assets = await repository.findByItemId(itemId);
  return assets
    .filter((asset) => asset.telegramFileId !== undefined && asset.telegramFileType !== undefined)
    .map((asset) => ({
      kind: toParsedMediaKind(asset.telegramFileType),
      fileId: asset.telegramFileId!,
      ...(asset.telegramFileUniqueId === undefined ? {} : { fileUniqueId: asset.telegramFileUniqueId }),
      ...(asset.telegramMediaGroupId === undefined ? {} : { mediaGroupId: asset.telegramMediaGroupId }),
      ...(asset.telegramMimeType === undefined ? {} : { mimeType: asset.telegramMimeType }),
      ...(asset.telegramFileSize === undefined ? {} : { fileSize: asset.telegramFileSize }),
      ...(asset.width === undefined ? {} : { width: asset.width }),
      ...(asset.height === undefined ? {} : { height: asset.height }),
      ...(asset.durationSeconds === undefined ? {} : { durationSeconds: asset.durationSeconds })
    }));
}

function toParsedMediaKind(value: string | undefined): ParsedTelegramMedia["kind"] {
  if (value === "photo") return "photo";
  if (value === "video") return "video";
  if (value === "animation") return "animation";
  return "document";
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function redactPublishError(error: unknown): string {
  if (error instanceof Error) {
    return redactTelegramApiError(error.message);
  }
  return "Telegram publish failed.";
}
