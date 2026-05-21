import type { TelegramWebhookAck } from "@curator/telegram";
import { jsonResponse } from "../http/json";

export type TelegramUpdateStub = {
  update_id?: number;
  message?: unknown;
  callback_query?: unknown;
};

export async function handleTelegramWebhook(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, { status: 405 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return jsonResponse({ ok: false, error: "unsupported_media_type" }, { status: 415 });
  }

  const update = await request.json().catch(() => null) as TelegramUpdateStub | null;
  if (!update || typeof update !== "object") {
    return jsonResponse({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const body: TelegramWebhookAck = {
    ok: true,
    stub: true,
    ...(update.update_id === undefined ? {} : { receivedUpdateId: update.update_id })
  };

  return jsonResponse(body);
}
