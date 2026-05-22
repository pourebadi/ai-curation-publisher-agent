import { jsonResponse } from "./http/json";
import { handleHealth } from "./routes/health";
import { handleInternalE2EMockPipeline } from "./routes/internal-e2e-mock";
import { handleInternalFirecrawlSandbox } from "./routes/internal-firecrawl-sandbox";
import { handleInternalPoll } from "./routes/internal-poll";
import { handleInternalTelegramPublish } from "./routes/internal-publish";
import { handleInternalTelegramReviewDryRun } from "./routes/internal-telegram-review-dry-run";
import { handleInternalWordPressDryRun } from "./routes/internal-wordpress-dry-run";
import { handleReady } from "./routes/ready";
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

    if (url.pathname === "/ready") {
      return handleReady(request, env);
    }

    if (url.pathname === "/status") {
      return handleStatus(request, env);
    }

    if (url.pathname === "/internal/poll") {
      return handleInternalPoll(request, env);
    }

    if (url.pathname === "/internal/providers/firecrawl/sandbox-fetch") {
      return handleInternalFirecrawlSandbox(request, env);
    }

    if (url.pathname === "/internal/telegram/review-dry-run") {
      return handleInternalTelegramReviewDryRun(request, env);
    }

    if (url.pathname === "/internal/wordpress/dry-run") {
      return handleInternalWordPressDryRun(request, env);
    }

    if (url.pathname === "/internal/e2e/mock-pipeline") {
      return handleInternalE2EMockPipeline(request, env);
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
