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
  const integrationReady = config.readiness.productionReviewReady
    || config.readiness.wordpressDraftReady
    || config.readiness.hasProviderCredentials.firecrawl;
  const pilotReady = config.readiness.setupSafe
    && config.readiness.hasInternalSecret
    && (config.operatingMode === "mock_demo" || integrationReady || config.readiness.ai.ready);

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
      publishing: {
        available: true,
        publicPublishingEnabled: false,
        schedulerPublishingAllowed: config.scheduler.publishingAllowed,
        note: "Publishing code is present, but public publishing and scheduler publishing remain disabled by this phase."
      }
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
      modeAllowsPilot: config.operatingMode === "manual_only" || config.operatingMode === "mock_demo" || config.readiness.providerSetupSatisfied,
      setupSafe: config.readiness.setupSafe,
      firecrawlConfigured: config.readiness.hasProviderCredentials.firecrawl,
      telegramReviewConfigured: config.readiness.productionReviewReady,
      telegramRealReviewEnabled: config.readiness.telegramRealReviewEnabled,
      wordpressConfigured: config.readiness.wordpressDraftReady,
      wordpressRealDryRunEnabled: config.readiness.wordpressRealDryRunEnabled,
      schedulerEnabled: config.readiness.scheduler.enabled,
      schedulerDryRun: config.readiness.scheduler.dryRun
    },
    scheduler: config.scheduler,
    quotas: config.quotas,
    timestamp: timestamp()
  });
}
