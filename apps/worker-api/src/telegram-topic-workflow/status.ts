import { TelegramRoutesRepository } from "@curator/db";
import type { Env } from "../types";

export type TelegramTopicWorkflowSummary = {
  topicWorkflowConfigured: boolean;
  routeCount: number;
  enabledRouteCount: number;
  outputCount: number;
  enabledOutputCount: number;
  botTokenConfigured: boolean;
  reviewRoutingConfigured: boolean;
  finalPublishingEnabled: false;
  wordpressOptional: true;
  warnings: string[];
};

export async function readTelegramTopicWorkflowSummary(env: Env): Promise<TelegramTopicWorkflowSummary> {
  const repository = new TelegramRoutesRepository(env.DB);
  const warnings: string[] = [];
  let routeCount = 0;
  let enabledRouteCount = 0;
  let outputCount = 0;
  let enabledOutputCount = 0;
  let reviewRoutingConfigured = false;

  try {
    const summary = await repository.countSummary();
    routeCount = summary.routeCount;
    enabledRouteCount = summary.enabledRouteCount;
    outputCount = summary.outputCount;
    enabledOutputCount = summary.enabledOutputCount;
    reviewRoutingConfigured = summary.reviewRoutingConfigured;
  } catch {
    warnings.push("Telegram topic routing tables are missing or inaccessible. Apply Phase 33 D1 migrations.");
  }

  if (enabledRouteCount === 0) {
    warnings.push("No enabled Telegram topic routes are configured.");
  }
  if (enabledOutputCount === 0) {
    warnings.push("No enabled Telegram route outputs are configured.");
  }
  if (!env.TELEGRAM_BOT_TOKEN?.trim()) {
    warnings.push("TELEGRAM_BOT_TOKEN is not configured. Real review delivery cannot run.");
  }

  return {
    topicWorkflowConfigured: enabledRouteCount > 0 && enabledOutputCount > 0,
    routeCount,
    enabledRouteCount,
    outputCount,
    enabledOutputCount,
    botTokenConfigured: Boolean(env.TELEGRAM_BOT_TOKEN?.trim()),
    reviewRoutingConfigured,
    finalPublishingEnabled: false,
    wordpressOptional: true,
    warnings
  };
}
