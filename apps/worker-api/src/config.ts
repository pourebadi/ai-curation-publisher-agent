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
    providers: summarizeProviderConfig(providerConfig)
  };
}
