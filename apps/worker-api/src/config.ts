import { readProviderRuntimeConfig, summarizeProviderConfig, type ProviderConfigSummary } from "@curator/providers";
import { readSchedulerSettings, type SchedulerSettings } from "./operations/scheduled-poll";
import type { Env } from "./types";

export type WorkerOperationalConfig = {
  serviceName: "ai-curation-publisher-agent";
  environment: string;
  logLevel: string;
  mockMode: true;
  telegram: {
    reviewChatConfigured: boolean;
    finalChatConfigured: boolean;
    finalChatId: string;
    botTokenConfigured: boolean;
    realReviewEnabled: boolean;
  };
  wordpress: {
    configured: boolean;
    baseUrlConfigured: boolean;
    credentialsConfigured: boolean;
    realDryRunEnabled: boolean;
    defaultStatus: string;
  };
  scheduler: {
    enabled: boolean;
    dryRun: boolean;
    realProvidersAllowed: boolean;
    publishingAllowed: boolean;
    maxSourcesPerRun: number;
    maxItemsPerRun: number;
  };
  quotas: SchedulerSettings["quotas"];
  providers: ProviderConfigSummary;
  readiness: SafeConfigSummary;
};

export type SafeConfigSummary = {
  environment: string;
  mockMode: true;
  providersMode: string;
  hasInternalSecret: boolean;
  hasTelegramConfig: boolean;
  hasTelegramBotToken: boolean;
  telegramRealReviewEnabled: boolean;
  hasWordPressConfig: boolean;
  hasWordPressBaseUrl: boolean;
  hasWordPressCredentials: boolean;
  wordpressRealDryRunEnabled: boolean;
  wordpressDefaultStatus: string;
  scheduler: {
    enabled: boolean;
    dryRun: boolean;
    realProvidersAllowed: boolean;
    publishingAllowed: boolean;
    maxSourcesPerRun: number;
    maxItemsPerRun: number;
  };
  quotas: SchedulerSettings["quotas"];
  hasProviderCredentials: {
    apify: boolean;
    getxapi: boolean;
    firecrawl: boolean;
  };
};

export type ConfigValidationResult = {
  ready: boolean;
  summary: SafeConfigSummary;
  warnings: string[];
  errors: string[];
};

export function readOperationalConfig(env: Env): WorkerOperationalConfig {
  const providerConfig = readProviderRuntimeConfig(env);
  const safeSummary = buildSafeConfigSummary(env);

  return {
    serviceName: "ai-curation-publisher-agent",
    environment: env.ENVIRONMENT ?? "unknown",
    logLevel: env.LOG_LEVEL ?? "info",
    mockMode: true,
    telegram: {
      reviewChatConfigured: Boolean(env.TELEGRAM_REVIEW_CHAT_ID),
      finalChatConfigured: Boolean(env.TELEGRAM_FINAL_CHAT_ID),
      finalChatId: env.TELEGRAM_FINAL_CHAT_ID ?? "mock_final_chat",
      botTokenConfigured: hasValue(env.TELEGRAM_BOT_TOKEN),
      realReviewEnabled: env.TELEGRAM_REAL_REVIEW_ENABLED === "true"
    },
    wordpress: {
      configured: safeSummary.hasWordPressConfig,
      baseUrlConfigured: safeSummary.hasWordPressBaseUrl,
      credentialsConfigured: safeSummary.hasWordPressCredentials,
      realDryRunEnabled: safeSummary.wordpressRealDryRunEnabled,
      defaultStatus: safeSummary.wordpressDefaultStatus
    },
    scheduler: safeSummary.scheduler,
    quotas: safeSummary.quotas,
    providers: summarizeProviderConfig(providerConfig),
    readiness: safeSummary
  };
}

export function validateRuntimeConfig(env: Env): ConfigValidationResult {
  const summary = buildSafeConfigSummary(env);
  const warnings: string[] = [];
  const errors: string[] = [];
  const production = summary.environment === "production";

  if (!summary.hasInternalSecret) {
    const message = "INTERNAL_API_SECRET is not configured.";
    if (production) {
      errors.push(message);
    } else {
      warnings.push(message);
    }
  }

  if (!summary.hasTelegramConfig) {
    const message = "Telegram runtime configuration is incomplete.";
    if (production) {
      errors.push(message);
    } else {
      warnings.push(message);
    }
  }

  if (summary.telegramRealReviewEnabled && (!summary.hasTelegramBotToken || !summary.hasTelegramConfig)) {
    const message = "Telegram real review dry-run is enabled but Telegram review configuration is incomplete.";
    if (production) {
      errors.push(message);
    } else {
      warnings.push(message);
    }
  }

  if (!summary.hasWordPressConfig) {
    const message = "WordPress runtime configuration is incomplete.";
    if (production) {
      warnings.push(message);
    } else {
      warnings.push(message);
    }
  }

  if (summary.wordpressRealDryRunEnabled && !summary.hasWordPressConfig) {
    const message = "WordPress real dry-run is enabled but WordPress configuration is incomplete.";
    if (production) {
      errors.push(message);
    } else {
      warnings.push(message);
    }
  }

  if (summary.scheduler.enabled && !summary.scheduler.dryRun) {
    warnings.push("Scheduler is enabled outside dry-run mode. Phase 21 still prevents publishing side effects.");
  }

  if (summary.scheduler.realProvidersAllowed) {
    warnings.push("Scheduler real provider access is allowed by config, but Phase 21 keeps scheduler polling mock-safe.");
  }

  if (summary.scheduler.publishingAllowed) {
    warnings.push("Scheduler publishing is allowed by config, but Phase 21 does not trigger publishing.");
  }

  if (summary.providersMode !== "mock" && !Object.values(summary.hasProviderCredentials).some(Boolean)) {
    const message = "Provider mode is not mock, but no provider credentials are configured.";
    if (production) {
      errors.push(message);
    } else {
      warnings.push(message);
    }
  }

  return {
    ready: errors.length === 0,
    summary,
    warnings,
    errors
  };
}

export function buildSafeConfigSummary(env: Env): SafeConfigSummary {
  const providerConfig = readProviderRuntimeConfig(env);
  const schedulerSettings = readSchedulerSettings(env);
  const hasWordPressBaseUrl = hasValue(env.WORDPRESS_BASE_URL);
  const hasWordPressCredentials = hasValue(env.WORDPRESS_USERNAME) && hasValue(env.WORDPRESS_APPLICATION_PASSWORD);

  return {
    environment: env.ENVIRONMENT ?? "unknown",
    mockMode: true,
    providersMode: providerConfig.mode,
    hasInternalSecret: hasValue(env.INTERNAL_API_SECRET),
    hasTelegramConfig: hasValue(env.TELEGRAM_REVIEW_CHAT_ID) && hasValue(env.TELEGRAM_FINAL_CHAT_ID),
    hasTelegramBotToken: hasValue(env.TELEGRAM_BOT_TOKEN),
    telegramRealReviewEnabled: env.TELEGRAM_REAL_REVIEW_ENABLED === "true",
    hasWordPressConfig: hasWordPressBaseUrl && hasWordPressCredentials,
    hasWordPressBaseUrl,
    hasWordPressCredentials,
    wordpressRealDryRunEnabled: env.WORDPRESS_REAL_DRY_RUN_ENABLED === "true",
    wordpressDefaultStatus: normalizeWordPressStatus(env.WORDPRESS_DEFAULT_STATUS),
    scheduler: {
      enabled: schedulerSettings.schedulerEnabled,
      dryRun: schedulerSettings.dryRun,
      realProvidersAllowed: schedulerSettings.realProvidersAllowed,
      publishingAllowed: schedulerSettings.publishingAllowed,
      maxSourcesPerRun: schedulerSettings.maxSources,
      maxItemsPerRun: schedulerSettings.maxItems
    },
    quotas: schedulerSettings.quotas,
    hasProviderCredentials: {
      apify: hasValue(env.APIFY_TOKEN),
      getxapi: hasValue(env.GETXAPI_KEY),
      firecrawl: hasValue(env.FIRECRAWL_API_KEY)
    }
  };
}

function normalizeWordPressStatus(value: string | undefined): string {
  return value === "pending" || value === "private" || value === "publish" ? value : "draft";
}

function hasValue(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
