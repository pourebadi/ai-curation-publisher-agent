import { corsPreflightResponse, withCors } from "./http/cors";
import { jsonResponse } from "./http/json";
import { handleHealth } from "./routes/health";
import { handleInternalAdminConfig } from "./routes/internal-admin-config";
import { handleInternalE2EMockPipeline } from "./routes/internal-e2e-mock";
import { handleInternalFirecrawlSandbox } from "./routes/internal-firecrawl-sandbox";
import { handleInternalPoll } from "./routes/internal-poll";
import { handleInternalRealIntegrationsPilot } from "./routes/internal-real-integrations-pilot";
import { handleInternalTelegramPublish } from "./routes/internal-publish";
import { handleInternalSchedulerRun } from "./routes/internal-scheduler-run";
import { handleInternalTelegramReviewDryRun } from "./routes/internal-telegram-review-dry-run";
import { handleInternalTelegramOutputsRecent } from "./routes/internal-telegram-outputs-recent";
import { handleInternalTelegramPublishRetry } from "./routes/internal-telegram-publish-retry";
import { handleInternalTelegramTopicRoutes } from "./routes/internal-telegram-topic-routes";
import { handleInternalWordPressDryRun } from "./routes/internal-wordpress-dry-run";
import { handleReady } from "./routes/ready";
import { handleStatus } from "./routes/status";
import { handleTelegramWebhook } from "./routes/telegram-webhook";
import { handleScheduledPoll } from "./scheduled/poller";
import type { Env } from "./types";

const worker: ExportedHandler<Env> = {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return corsPreflightResponse(request);
    }

    const response = await routeRequest(request, env);
    return withCors(request, response);
  },

  async scheduled(controller, env) {
    await handleScheduledPoll(controller, env);
  }
};

async function routeRequest(request: Request, env: Env): Promise<Response> {
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

  if (url.pathname === "/internal/admin/config" || url.pathname === "/internal/admin/config/reset" || url.pathname === "/internal/admin/config/audit") {
    return handleInternalAdminConfig(request, env);
  }

  if (url.pathname === "/internal/poll") {
    return handleInternalPoll(request, env);
  }

  if (url.pathname === "/internal/scheduler/run") {
    return handleInternalSchedulerRun(request, env);
  }

  if (url.pathname === "/internal/pilot/real-integrations") {
    return handleInternalRealIntegrationsPilot(request, env);
  }

  if (url.pathname === "/internal/providers/firecrawl/sandbox-fetch") {
    return handleInternalFirecrawlSandbox(request, env);
  }

  if (url.pathname === "/internal/telegram/review-dry-run") {
    return handleInternalTelegramReviewDryRun(request, env);
  }

  if (url.pathname === "/internal/telegram/outputs/recent") {
    return handleInternalTelegramOutputsRecent(request, env);
  }

  if (isTelegramTopicRoutesPath(url.pathname)) {
    return handleInternalTelegramTopicRoutes(request, env);
  }

  if (url.pathname === "/internal/telegram/publish/retry") {
    return handleInternalTelegramPublishRetry(request, env);
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
}

function isTelegramTopicRoutesPath(pathname: string): boolean {
  return pathname === "/internal/telegram/topic-routes"
    || pathname === "/internal/telegram/topic-routes/seed"
    || pathname === "/internal/telegram/topic-routes/validate"
    || pathname.startsWith("/internal/telegram/topic-routes/")
    || pathname.startsWith("/internal/telegram/topic-route-outputs/");
}

export default worker;
