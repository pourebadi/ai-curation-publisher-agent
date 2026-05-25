export type TelegramRouteManagerSummary = {
  botStatus: "Configured" | "Missing";
  finalPublishing: "Enabled" | "Disabled";
  routeCount: number;
  enabledOutputCount: number;
  mediaMode: string;
  wordpress: "Optional";
  routeCards: TelegramRouteCard[];
};

export type TelegramRouteCard = {
  title: string;
  category: string;
  sourceChatId: string;
  sourceThreadId: number;
  promptProfile: string;
  enabledLabel: "Enabled" | "Disabled";
  outputsCount: number;
  warnings: string[];
  outputs: Array<{
    title: string;
    language: string;
    reviewChatId: string;
    reviewThreadId: number;
    finalChatId: string;
    finalThreadId?: number;
    enabledLabel: "Enabled" | "Disabled";
    latestStatus: string;
  }>;
};

export const TELEGRAM_ROUTE_FORM_FIELDS = [
  { label: "Route ID", helper: "Technical name: id. Example: crypto", secret: false },
  { label: "Category", helper: "Human category shown to operators. Example: crypto", secret: false },
  { label: "Source chat ID", helper: "Technical name: sourceChatId. Example: -1001234567890", secret: false },
  { label: "Source topic ID", helper: "Technical name: sourceThreadId. Example: 101", secret: false },
  { label: "Prompt profile", helper: "Technical name: promptProfile. Example: crypto_editorial", secret: false },
  { label: "Enabled", helper: "Disabled routes are ignored safely.", secret: false }
] as const;

export const TELEGRAM_OUTPUT_FORM_FIELDS = [
  { label: "Output ID", helper: "Technical name: id. Example: crypto_fa", secret: false },
  { label: "Language", helper: "Example: fa, en, ar", secret: false },
  { label: "Review chat ID", helper: "Technical name: reviewChatId. Usually the internal forum group ID.", secret: false },
  { label: "Review topic ID", helper: "Technical name: reviewThreadId. Example: 201", secret: false },
  { label: "Final channel/chat ID", helper: "Technical name: finalChatId. Example: @crypto_fa", secret: false },
  { label: "Final topic ID", helper: "Optional technical name: finalThreadId.", secret: false },
  { label: "Enabled", helper: "Disabled outputs are skipped safely.", secret: false }
] as const;

export function telegramRouteManagerCopy(): string {
  return "Topic names are only for humans. The system uses numeric topic IDs.";
}

export function buildTelegramRouteManagerSummary(topicWorkflow: Record<string, unknown> | undefined): TelegramRouteManagerSummary {
  const routes = Array.isArray(topicWorkflow?.routes) ? topicWorkflow.routes.filter(isRecord) : [];
  return {
    botStatus: topicWorkflow?.botTokenConfigured === true ? "Configured" : "Missing",
    finalPublishing: topicWorkflow?.finalPublishingEnabled === true ? "Enabled" : "Disabled",
    routeCount: readNumber(topicWorkflow?.routeCount) ?? routes.length,
    enabledOutputCount: readNumber(topicWorkflow?.enabledOutputCount) ?? 0,
    mediaMode: readString(topicWorkflow?.mediaMode) ?? "metadata_only",
    wordpress: "Optional",
    routeCards: routes.map(toRouteCard)
  };
}

export function summarizeRecentTelegramOutputs(rawOutputs: unknown): Array<{ itemId: string; category: string; language: string; reviewStatus: string; publishQueueStatus: string; finalChatId: string; lastError: string; updatedAt: string }> {
  if (!Array.isArray(rawOutputs)) return [];
  return rawOutputs.filter(isRecord).map((entry) => ({
    itemId: readString(entry.itemId) ?? "unknown",
    category: readString(entry.category) ?? "unknown",
    language: readString(entry.language) ?? "unknown",
    reviewStatus: readString(entry.reviewStatus) ?? readString(entry.status) ?? "unknown",
    publishQueueStatus: readString(entry.publishQueueStatus) ?? "not queued",
    finalChatId: readString(entry.finalChatId) ?? "not configured",
    lastError: redactStatusText(readString(entry.lastError) ?? readString(entry.errorMessage) ?? "none"),
    updatedAt: readString(entry.updatedAt) ?? "unknown"
  }));
}

function toRouteCard(route: Record<string, unknown>): TelegramRouteCard {
  const outputs = Array.isArray(route.outputs) ? route.outputs.filter(isRecord) : [];
  return {
    title: readString(route.category) ?? readString(route.id) ?? "Telegram route",
    category: readString(route.category) ?? "uncategorized",
    sourceChatId: readString(route.sourceChatId) ?? "missing",
    sourceThreadId: readNumber(route.sourceThreadId) ?? 0,
    promptProfile: readString(route.promptProfile) ?? "missing",
    enabledLabel: route.enabled === false ? "Disabled" : "Enabled",
    outputsCount: outputs.length,
    warnings: readStringArray(route.warnings),
    outputs: outputs.map((output) => ({
      title: `${readString(output.language) ?? "unknown"} output`,
      language: readString(output.language) ?? "unknown",
      reviewChatId: readString(output.reviewChatId) ?? "missing",
      reviewThreadId: readNumber(output.reviewThreadId) ?? 0,
      finalChatId: readString(output.finalChatId) ?? "missing",
      ...(readNumber(output.finalThreadId) === undefined ? {} : { finalThreadId: readNumber(output.finalThreadId)! }),
      enabledLabel: output.enabled === false ? "Disabled" : "Enabled",
      latestStatus: readString(output.latestStatus) ?? "not generated yet"
    }))
  };
}

function redactStatusText(value: string): string {
  return value.split("bot").join("bot[redacted-prefix]").replace(/[0-9]{6,}:[A-Za-z0-9_-]+/g, "[redacted-token]");
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
