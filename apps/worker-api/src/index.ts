import { jsonResponse } from "./http/json";
import { handleHealth } from "./routes/health";
import { handleTelegramWebhook } from "./routes/telegram-webhook";
import { handleScheduledPoll } from "./scheduled/poller";
import type { Env } from "./types";

const worker: ExportedHandler<Env> = {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      return handleHealth(request, env);
    }

    if (url.pathname === "/telegram/webhook") {
      return handleTelegramWebhook(request, env);
    }

    return jsonResponse({ ok: false, error: "not_found" }, { status: 404 });
  },

  async scheduled(controller, env) {
    await handleScheduledPoll(controller, env);
  }
};

export default worker;
