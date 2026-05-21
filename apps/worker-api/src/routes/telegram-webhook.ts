import { parseAllowedReviewerIds, parseTelegramUpdate, isReviewerAllowed, type TelegramUpdate, type TelegramWebhookAck } from "@curator/telegram";
import { handleManualIngest } from "../handlers/manual-ingest";
import { handleReviewCallback } from "../handlers/review-callback";
import { jsonResponse } from "../http/json";
import type { Env } from "../types";

export async function handleTelegramWebhook(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, { status: 405 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return jsonResponse({ ok: false, error: "unsupported_media_type" }, { status: 415 });
  }

  const update = await request.json().catch(() => null) as TelegramUpdate | null;
  if (!update || typeof update !== "object") {
    return jsonResponse({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = parseTelegramUpdate(update);
  if (parsed.kind === "ignored") {
    return jsonResponse({
      ok: true,
      receivedUpdateId: parsed.updateId,
      kind: parsed.kind,
      ignoredReason: parsed.reason
    });
  }

  const allowedReviewerIds = parseAllowedReviewerIds(env.TELEGRAM_ALLOWED_REVIEWER_IDS);
  if (!isReviewerAllowed(parsed.reviewerId, allowedReviewerIds)) {
    return jsonResponse({
      ok: false,
      error: "unauthorized_reviewer",
      receivedUpdateId: parsed.updateId
    }, { status: 403 });
  }

  if (parsed.kind === "manual_message") {
    const result = await handleManualIngest(parsed, env.DB, {
      reviewChatId: env.TELEGRAM_REVIEW_CHAT_ID
    });

    const body: TelegramWebhookAck & { manualIngest: typeof result } = {
      ok: true,
      receivedUpdateId: parsed.updateId,
      kind: parsed.kind,
      itemId: result.itemId,
      manualIngest: result
    };

    return jsonResponse(body);
  }

  const callbackResult = await handleReviewCallback(parsed, env.DB);
  const body: TelegramWebhookAck & { callbackResult: typeof callbackResult } = {
    ok: true,
    receivedUpdateId: parsed.updateId,
    kind: parsed.kind,
    itemId: callbackResult.itemId,
    callbackAction: callbackResult.action,
    callbackResult
  };

  return jsonResponse(body);
}
