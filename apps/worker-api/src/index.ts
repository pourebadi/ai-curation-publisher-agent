import { jsonResponse } from "./http/json";
import { handleHealth } from "./routes/health";
import { handleInternalPoll } from "./routes/internal-poll";
import { handleInternalTelegramPublish } from "./routes/internal-publish";
import { handleStatus } from "./routes/status";
import { handleTelegramWebhook } from "./routes/telegram-webhook";
import { handleScheduledPoll } from "./scheduled/poller";
import type { Env } from "./types";

const worker: ExportedHandler<Env> = {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "/health") {
      return handleHealth(request, env);
    }

    if (url.pathname === "/status") {
      return handleStatus(request, env);
    }

    if (url.pathname === "/internal/poll") {
      return handleInternalPoll(request, env);
    }

    if (url.pathname === "/internal/publish/telegram") {
      return handleInternalTelegramPublish(request, env);
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
