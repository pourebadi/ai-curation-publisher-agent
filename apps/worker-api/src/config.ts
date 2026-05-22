import { readProviderRuntimeConfig, summarizeProviderConfig, type ProviderConfigSummary } from "@curator/providers";
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
  };
  providers: ProviderConfigSummary;
  readiness: SafeConfigSummary;
};

export type SafeConfigSummary = {
  environment: string;
  mockMode: true;
  providersMode: string;
  hasInternalSecret: boolean;
  hasTelegramConfig: boolean;
  hasWordPressConfig: boolean;
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

  return {
    serviceName: "ai-curation-publisher-agent",
    environment: env.ENVIRONMENT ?? "unknown",
    logLevel: env.LOG_LEVEL ?? "info",
    mockMode: true,
    telegram: {
      reviewChatConfigured: Boolean(env.TELEGRAM_REVIEW_CHAT_ID),
      finalChatConfigured: Boolean(env.TELEGRAM_FINAL_CHAT_ID),
      finalChatId: env.TELEGRAM_FINAL_CHAT_ID ?? "mock_final_chat"
    },
    providers: summarizeProviderConfig(providerConfig),
    readiness: buildSafeConfigSummary(env)
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

  if (!summary.hasWordPressConfig) {
    const message = "WordPress runtime configuration is incomplete.";
    if (production) {
      warnings.push(message);
    } else {
      warnings.push(message);
    }
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

  return {
    environment: env.ENVIRONMENT ?? "unknown",
    mockMode: true,
    providersMode: providerConfig.mode,
    hasInternalSecret: hasValue(env.INTERNAL_API_SECRET),
    hasTelegramConfig: hasValue(env.TELEGRAM_REVIEW_CHAT_ID) && hasValue(env.TELEGRAM_FINAL_CHAT_ID),
    hasWordPressConfig: hasValue(env.WORDPRESS_BASE_URL) && hasValue(env.WORDPRESS_USERNAME) && hasValue(env.WORDPRESS_APPLICATION_PASSWORD),
    hasProviderCredentials: {
      apify: hasValue(env.APIFY_TOKEN),
      getxapi: hasValue(env.GETXAPI_KEY),
      firecrawl: hasValue(env.FIRECRAWL_API_KEY)
    }
  };
}

function hasValue(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
