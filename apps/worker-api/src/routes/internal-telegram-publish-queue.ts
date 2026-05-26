import { TELEGRAM_PUBLISH_QUEUE_STATUSES, TelegramPublishQueueRepository, type TelegramPublishQueueStatus } from "@curator/db";
import { jsonResponse } from "../http/json";
import { verifyInternalRequest } from "../security/internal-auth";
import { methodNotAllowed, unauthorized } from "./response";
import type { Env } from "../types";

export async function handleInternalTelegramPublishQueue(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") return methodNotAllowed(["GET"], request);
  const auth = verifyInternalRequest(request, env);
  if (!auth.ok) return unauthorized(auth.error, "Internal API authorization failed.", request);

  const url = new URL(request.url);
  const limit = clampLimit(Number(url.searchParams.get("limit") ?? 25));
  const status = readQueueStatus(url.searchParams.get("status"));
  const repository = new TelegramPublishQueueRepository(env.DB);
  const queue = await repository.listRecent(limit, status);

  return jsonResponse({
    ok: true,
    queue: queue.map((item) => ({
      queueId: item.id,
      itemId: item.itemId,
      generatedOutputId: item.generatedOutputId,
      routeId: item.routeId,
      routeOutputId: item.routeOutputId,
      language: item.language,
      finalChatId: item.finalChatId,
      finalThreadId: item.finalThreadId,
      status: item.status,
      scheduledFor: item.scheduledFor,
      priority: item.priority,
      attemptCount: item.attemptCount,
      lastError: redactError(item.lastError ?? ""),
      finalMessageId: item.finalMessageId,
      updatedAt: item.updatedAt
    }))
  });
}

function readQueueStatus(value: string | null): TelegramPublishQueueStatus | undefined {
  return TELEGRAM_PUBLISH_QUEUE_STATUSES.includes(value as TelegramPublishQueueStatus) ? value as TelegramPublishQueueStatus : undefined;
}

function clampLimit(value: number): number {
  if (!Number.isFinite(value)) return 25;
  return Math.min(100, Math.max(1, Math.floor(value)));
}

function redactError(value: string): string {
  if (!value) return "";
  return value.replace(/[0-9]{6,}:[A-Za-z0-9_-]+/g, "[redacted-token]").slice(0, 240);
}
