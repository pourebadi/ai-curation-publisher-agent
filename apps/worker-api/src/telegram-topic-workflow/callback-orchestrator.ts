import { MediaAssetsRepository, TelegramGeneratedOutputsRepository, TelegramPublishQueueRepository, TelegramRoutesRepository } from "@curator/db";
import { RealTelegramClient, redactTelegramApiError, type ParsedTelegramMedia, type ParsedTelegramOutputCallback, type TelegramClient } from "@curator/telegram";
import type { Env } from "../types";

export type TelegramOutputCallbackResult = {
  ok: boolean;
  kind: "output_callback";
  generatedOutputId: string;
  action: ParsedTelegramOutputCallback["action"];
  status?: string;
  publishQueueStatus?: string;
  message: string;
  finalPublishingTriggered: boolean;
};

type EnvWithFinalPublish = Env & {
  TELEGRAM_FINAL_PUBLISH_ENABLED?: string;
};

export async function handleTelegramOutputCallback(parsed: ParsedTelegramOutputCallback, env: Env, telegramClient?: TelegramClient): Promise<TelegramOutputCallbackResult> {
  const generatedOutputsRepository = new TelegramGeneratedOutputsRepository(env.DB);
  const publishQueueRepository = new TelegramPublishQueueRepository(env.DB);
  const routesRepository = new TelegramRoutesRepository(env.DB);
  const mediaAssetsRepository = new MediaAssetsRepository(env.DB);
  const generatedOutput = await generatedOutputsRepository.findById(parsed.token);

  if (!generatedOutput) {
    await telegramClient?.answerCallbackQuery({ callbackQueryId: parsed.callback.id, text: "Output was not found." });
    return {
      ok: false,
      kind: "output_callback",
      generatedOutputId: parsed.token,
      action: parsed.action,
      message: "Telegram generated output was not found.",
      finalPublishingTriggered: false
    };
  }

  if (parsed.action === "status") {
    const queueItem = await publishQueueRepository.findByGeneratedOutputId(generatedOutput.id);
    const message = queueItem ? `Status: ${generatedOutput.status}. Publish queue: ${queueItem.status}.` : `Status: ${generatedOutput.status}. Not queued for final publishing.`;
    await telegramClient?.answerCallbackQuery({ callbackQueryId: parsed.callback.id, text: message });
    return {
      ok: true,
      kind: "output_callback",
      generatedOutputId: generatedOutput.id,
      action: parsed.action,
      status: generatedOutput.status,
      ...(queueItem === null ? {} : { publishQueueStatus: queueItem.status }),
      message,
      finalPublishingTriggered: false
    };
  }

  if (parsed.action === "cancel") {
    if (generatedOutput.status === "published" || generatedOutput.status === "cancelled") {
      const message = `Already ${generatedOutput.status}.`;
      await telegramClient?.answerCallbackQuery({ callbackQueryId: parsed.callback.id, text: message });
      return {
        ok: true,
        kind: "output_callback",
        generatedOutputId: generatedOutput.id,
        action: parsed.action,
        status: generatedOutput.status,
        message,
        finalPublishingTriggered: false
      };
    }

    await generatedOutputsRepository.updateStatus(generatedOutput.id, "cancelled");
    await telegramClient?.answerCallbackQuery({ callbackQueryId: parsed.callback.id, text: "Cancelled this output." });
    return {
      ok: true,
      kind: "output_callback",
      generatedOutputId: generatedOutput.id,
      action: parsed.action,
      status: "cancelled",
      message: "Cancelled this Telegram output only.",
      finalPublishingTriggered: false
    };
  }

  if (generatedOutput.status === "published" || generatedOutput.status === "cancelled") {
    const message = `Already ${generatedOutput.status}.`;
    await telegramClient?.answerCallbackQuery({ callbackQueryId: parsed.callback.id, text: message });
    return {
      ok: true,
      kind: "output_callback",
      generatedOutputId: generatedOutput.id,
      action: parsed.action,
      status: generatedOutput.status,
      message,
      finalPublishingTriggered: false
    };
  }

  const routeOutput = await routesRepository.findOutputById(generatedOutput.routeOutputId);
  if (!routeOutput) {
    await generatedOutputsRepository.updateStatus(generatedOutput.id, "failed", "Route output is missing.");
    await telegramClient?.answerCallbackQuery({ callbackQueryId: parsed.callback.id, text: "Route output is missing." });
    return {
      ok: false,
      kind: "output_callback",
      generatedOutputId: generatedOutput.id,
      action: parsed.action,
      status: "failed",
      message: "Route output is missing; cannot queue final publishing.",
      finalPublishingTriggered: false
    };
  }

  await generatedOutputsRepository.updateStatus(generatedOutput.id, "approved");
  const queueItem = await publishQueueRepository.enqueue({
    itemId: generatedOutput.itemId,
    generatedOutputId: generatedOutput.id,
    routeId: generatedOutput.routeId,
    routeOutputId: generatedOutput.routeOutputId,
    language: generatedOutput.language,
    finalChatId: routeOutput.finalChatId,
    ...(routeOutput.finalThreadId === undefined ? {} : { finalThreadId: routeOutput.finalThreadId })
  });

  if (!isFinalPublishingEnabled(env)) {
    await generatedOutputsRepository.updateStatus(generatedOutput.id, "queued_for_publish");
    await telegramClient?.answerCallbackQuery({ callbackQueryId: parsed.callback.id, text: "Queued. Final Telegram publishing is disabled." });
    return {
      ok: true,
      kind: "output_callback",
      generatedOutputId: generatedOutput.id,
      action: parsed.action,
      status: "queued_for_publish",
      publishQueueStatus: queueItem.status,
      message: "Queued. Final Telegram publishing is disabled.",
      finalPublishingTriggered: false
    };
  }

  const botToken = env.TELEGRAM_BOT_TOKEN?.trim();
  if (!botToken) {
    await generatedOutputsRepository.updateStatus(generatedOutput.id, "failed", "Telegram bot token is not configured.");
    await publishQueueRepository.markFailed(queueItem.id, "Telegram bot token is not configured.");
    await telegramClient?.answerCallbackQuery({ callbackQueryId: parsed.callback.id, text: "Publish failed. Telegram bot token is missing." });
    return {
      ok: false,
      kind: "output_callback",
      generatedOutputId: generatedOutput.id,
      action: parsed.action,
      status: "failed",
      publishQueueStatus: "failed",
      message: "Publish failed. Telegram bot token is missing.",
      finalPublishingTriggered: true
    };
  }

  await generatedOutputsRepository.updateStatus(generatedOutput.id, "publishing");
  await publishQueueRepository.markPublishing(queueItem.id);

  try {
    const publishClient = new RealTelegramClient({ botToken });
    const media = await mediaForItem(mediaAssetsRepository, generatedOutput.itemId);
    const sent = await publishClient.publishFinalMessage({
      chatId: routeOutput.finalChatId,
      ...(routeOutput.finalThreadId === undefined ? {} : { messageThreadId: routeOutput.finalThreadId }),
      text: generatedOutput.output.caption,
      ...(media.length === 0 ? {} : { media })
    });
    await publishQueueRepository.markPublished(queueItem.id, sent.messageId);
    await generatedOutputsRepository.updateStatus(generatedOutput.id, "published");
    await telegramClient?.answerCallbackQuery({ callbackQueryId: parsed.callback.id, text: "Published to Telegram." });
    return {
      ok: true,
      kind: "output_callback",
      generatedOutputId: generatedOutput.id,
      action: parsed.action,
      status: "published",
      publishQueueStatus: "published",
      message: "Published to Telegram.",
      finalPublishingTriggered: true
    };
  } catch (error) {
    const message = redactPublishError(error);
    await publishQueueRepository.markFailed(queueItem.id, message);
    await generatedOutputsRepository.updateStatus(generatedOutput.id, "failed", message);
    await telegramClient?.answerCallbackQuery({ callbackQueryId: parsed.callback.id, text: "Publish failed. Check status for details." });
    return {
      ok: false,
      kind: "output_callback",
      generatedOutputId: generatedOutput.id,
      action: parsed.action,
      status: "failed",
      publishQueueStatus: "failed",
      message,
      finalPublishingTriggered: true
    };
  }
}

function isFinalPublishingEnabled(env: Env): boolean {
  return (env as EnvWithFinalPublish).TELEGRAM_FINAL_PUBLISH_ENABLED === "true";
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

function redactPublishError(error: unknown): string {
  if (error instanceof Error) {
    return redactTelegramApiError(error.message);
  }
  return "Telegram publish failed.";
}
