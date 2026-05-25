import { TelegramRoutesRepository, type TelegramRouteOutputRecord, type TelegramRouteRecord } from "@curator/db";
import type { Env } from "../types";

export type TelegramTopicWorkflowRouteSummary = {
  id: string;
  category: string;
  sourceChatId: string;
  sourceThreadId: number;
  promptProfile: string;
  enabled: boolean;
  outputs: Array<{
    id: string;
    language: string;
    reviewChatId: string;
    reviewThreadId: number;
    finalChatId: string;
    finalThreadId?: number;
    enabled: boolean;
  }>;
};

export type TelegramTopicWorkflowSummary = {
  topicWorkflowConfigured: boolean;
  routeCount: number;
  enabledRouteCount: number;
  outputCount: number;
  enabledOutputCount: number;
  botTokenConfigured: boolean;
  reviewRoutingConfigured: boolean;
  finalPublishingEnabled: boolean;
  wordpressOptional: true;
  mediaMode: "metadata_only";
  routes: TelegramTopicWorkflowRouteSummary[];
  warnings: string[];
};

type EnvWithFinalPublish = Env & {
  TELEGRAM_FINAL_PUBLISH_ENABLED?: string;
};

export async function readTelegramTopicWorkflowSummary(env: Env): Promise<TelegramTopicWorkflowSummary> {
  const repository = new TelegramRoutesRepository(env.DB);
  const warnings: string[] = [];
  let routeCount = 0;
  let enabledRouteCount = 0;
  let outputCount = 0;
  let enabledOutputCount = 0;
  let reviewRoutingConfigured = false;
  let routes: TelegramTopicWorkflowRouteSummary[] = [];
  const finalPublishingEnabled = (env as EnvWithFinalPublish).TELEGRAM_FINAL_PUBLISH_ENABLED === "true";

  try {
    const summary = await repository.countSummary();
    routeCount = summary.routeCount;
    enabledRouteCount = summary.enabledRouteCount;
    outputCount = summary.outputCount;
    enabledOutputCount = summary.enabledOutputCount;
    reviewRoutingConfigured = summary.reviewRoutingConfigured;
    const routeRecords = await repository.listRoutes();
    const outputRecords = await repository.listOutputs();
    routes = buildRouteSummaries(routeRecords, outputRecords);
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
    warnings.push("TELEGRAM_BOT_TOKEN is not configured. Real review delivery and final publishing cannot run.");
  }
  if (!finalPublishingEnabled) {
    warnings.push("Final Telegram publishing is disabled. Send callbacks queue outputs only.");
  }

  return {
    topicWorkflowConfigured: enabledRouteCount > 0 && enabledOutputCount > 0,
    routeCount,
    enabledRouteCount,
    outputCount,
    enabledOutputCount,
    botTokenConfigured: Boolean(env.TELEGRAM_BOT_TOKEN?.trim()),
    reviewRoutingConfigured,
    finalPublishingEnabled,
    wordpressOptional: true,
    mediaMode: "metadata_only",
    routes,
    warnings
  };
}

function buildRouteSummaries(routes: TelegramRouteRecord[], outputs: TelegramRouteOutputRecord[]): TelegramTopicWorkflowRouteSummary[] {
  return routes.map((route) => ({
    id: route.id,
    category: route.category,
    sourceChatId: route.sourceChatId,
    sourceThreadId: route.sourceThreadId,
    promptProfile: route.promptProfile,
    enabled: route.enabled,
    outputs: outputs.filter((output) => output.routeId === route.id).map((output) => ({
      id: output.id,
      language: output.language,
      reviewChatId: output.reviewChatId,
      reviewThreadId: output.reviewThreadId,
      finalChatId: output.finalChatId,
      ...(output.finalThreadId === undefined ? {} : { finalThreadId: output.finalThreadId }),
      enabled: output.enabled
    }))
  }));
}
