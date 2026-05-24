import { getEffectiveEnv } from "../admin-config/service";
import { readOperationalConfig } from "../config";
import { jsonResponse } from "../http/json";
import { methodNotAllowed, timestamp } from "./response";
import type { Env } from "../types";

export async function handleStatus(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  const effectiveEnv = await getEffectiveEnv(env);
  const config = readOperationalConfig(effectiveEnv);
  const pilotReady = config.operatingMode === "manual_only"
    || config.operatingMode === "mock_demo"
    || config.readiness.providerSetupSatisfied
    || config.readiness.hasProviderCredentials.firecrawl
    || (config.readiness.hasTelegramConfig && config.readiness.hasTelegramBotToken)
    || config.readiness.hasWordPressConfig;

  return jsonResponse({
    ok: true,
    service: config.serviceName,
    environment: config.environment,
    mockMode: config.mockMode,
    operatingMode: config.operatingMode,
    contentInput: config.contentInput,
    modules: {
      telegram: true,
      ai: true,
      db: Boolean(env.DB),
      providers: true,
      media: true,
      wordpress: true,
      publishing: true
    },
    ai: config.ai,
    providers: {
      ...config.providers,
      setupRequired: config.readiness.providerSetupRequired,
      setupSatisfied: config.readiness.providerSetupSatisfied
    },
    telegram: {
      reviewChatConfigured: config.telegram.reviewChatConfigured,
      finalChatConfigured: config.telegram.finalChatConfigured,
      botTokenConfigured: config.telegram.botTokenConfigured,
      realReviewEnabled: config.telegram.realReviewEnabled
    },
    wordpress: {
      configured: config.wordpress.configured,
      baseUrlConfigured: config.wordpress.baseUrlConfigured,
      credentialsConfigured: config.wordpress.credentialsConfigured,
      realDryRunEnabled: config.wordpress.realDryRunEnabled,
      defaultStatus: config.wordpress.defaultStatus
    },
    pilot: {
      ready: pilotReady,
      firecrawlConfigured: config.readiness.hasProviderCredentials.firecrawl,
      telegramReviewConfigured: config.readiness.hasTelegramConfig && config.readiness.hasTelegramBotToken,
      telegramRealReviewEnabled: config.readiness.telegramRealReviewEnabled,
      wordpressConfigured: config.readiness.hasWordPressConfig,
      wordpressRealDryRunEnabled: config.readiness.wordpressRealDryRunEnabled,
      schedulerEnabled: config.readiness.scheduler.enabled,
      schedulerDryRun: config.readiness.scheduler.dryRun
    },
    scheduler: config.scheduler,
    quotas: config.quotas,
    timestamp: timestamp()
  });
}
