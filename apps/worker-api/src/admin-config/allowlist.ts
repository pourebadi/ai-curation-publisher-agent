export type AdminConfigGroup = "telegram" | "wordpress" | "providers" | "scheduler" | "quotas" | "secrets";
export type AdminConfigValueType = "string" | "boolean" | "integer" | "url" | "enum" | "secret";
export type AdminConfigSource = "d1" | "env" | "default" | "missing";

export type AdminConfigDefinition = {
  key: string;
  group: AdminConfigGroup;
  label: string;
  description: string;
  valueType: AdminConfigValueType;
  isSecret: boolean;
  editable: true;
  where: "Dashboard override" | "Encrypted dashboard secret";
  defaultValue?: string;
  enumValues?: string[];
  min?: number;
  max?: number;
  preferHttps?: boolean;
};

export const FORBIDDEN_ADMIN_CONFIG_KEYS = new Set([
  "INTERNAL_API_SECRET",
  "CONFIG_ENCRYPTION_KEY",
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "DB",
  "D1_DATABASE_ID",
  "database_id"
]);

export const ADMIN_CONFIG_DEFINITIONS = [
  def("TELEGRAM_REVIEW_CHAT_ID", "telegram", "Telegram review chat", "Chat where review messages are sent.", "string"),
  def("TELEGRAM_FINAL_CHAT_ID", "telegram", "Telegram final chat", "Final chat id is tracked for readiness only. Dashboard does not publish to it.", "string"),
  def("TELEGRAM_REAL_REVIEW_ENABLED", "telegram", "Telegram review dry-run", "Allows review-channel dry-run when the backend is configured.", "boolean", { defaultValue: "false" }),

  def("WORDPRESS_BASE_URL", "wordpress", "WordPress site URL", "WordPress site used for draft-only checks.", "url", { preferHttps: true }),
  def("WORDPRESS_USERNAME", "wordpress", "WordPress username", "WordPress REST username for draft-only checks.", "string"),
  def("WORDPRESS_DEFAULT_STATUS", "wordpress", "WordPress default status", "WordPress status must remain draft for now.", "enum", { defaultValue: "draft", enumValues: ["draft"] }),
  def("WORDPRESS_REAL_DRY_RUN_ENABLED", "wordpress", "WordPress draft dry-run", "Allows explicit WordPress draft-only dry-run.", "boolean", { defaultValue: "false" }),

  def("PROVIDERS_MODE", "providers", "Providers mode", "Provider mode. Keep mock unless explicitly piloting.", "enum", { defaultValue: "mock", enumValues: ["mock", "mixed", "real"] }),
  def("ENABLE_FIRECRAWL_PROVIDER", "providers", "Enable Firecrawl provider", "Allows Firecrawl sandbox provider when provider mode permits it.", "boolean", { defaultValue: "false" }),
  def("FIRECRAWL_BASE_URL", "providers", "Firecrawl endpoint", "Optional Firecrawl endpoint override.", "url", { preferHttps: true }),
  def("FIRECRAWL_TIMEOUT_MS", "providers", "Firecrawl timeout", "Timeout for Firecrawl sandbox requests in milliseconds.", "integer", { defaultValue: "10000", min: 1000, max: 30000 }),

  def("SCHEDULER_DRY_RUN", "scheduler", "Scheduler dry-run", "Keeps scheduler work safe.", "boolean", { defaultValue: "true" }),
  def("SCHEDULER_MAX_SOURCES_PER_RUN", "scheduler", "Scheduler source limit", "Maximum sources per scheduler run.", "integer", { defaultValue: "1", min: 0, max: 10 }),
  def("SCHEDULER_MAX_ITEMS_PER_RUN", "scheduler", "Scheduler item limit", "Maximum items per scheduler run.", "integer", { defaultValue: "2", min: 0, max: 25 }),

  def("MAX_AI_ITEMS_PER_RUN", "quotas", "AI item quota", "Maximum AI items per run. Keep zero until explicitly scoped.", "integer", { defaultValue: "0", min: 0, max: 25 }),
  def("MAX_PROVIDER_ITEMS_PER_RUN", "quotas", "Provider item quota", "Maximum provider items per run.", "integer", { defaultValue: "5", min: 0, max: 50 }),
  def("MAX_PUBLISH_ITEMS_PER_RUN", "quotas", "Publish item quota", "Maximum publish items per run. Keep zero to prevent publishing.", "integer", { defaultValue: "0", min: 0, max: 0 }),

  secret("TELEGRAM_BOT_TOKEN", "Telegram bot token", "Bot token used by the Worker for Telegram review dry-run."),
  secret("TELEGRAM_WEBHOOK_SECRET", "Telegram webhook secret", "Shared secret for Telegram webhook verification."),
  secret("WORDPRESS_APPLICATION_PASSWORD", "WordPress application password", "WordPress REST application password for draft-only checks."),
  secret("FIRECRAWL_API_KEY", "Firecrawl API key", "Firecrawl credential for sandbox fetch."),
  secret("APIFY_TOKEN", "Apify token", "Apify credential for future provider pilot."),
  secret("GETXAPI_KEY", "GetXAPI key", "GetXAPI credential for future provider pilot.")
] as const satisfies readonly AdminConfigDefinition[];

export type EditableAdminConfigKey = typeof ADMIN_CONFIG_DEFINITIONS[number]["key"];

export function findAdminConfigDefinition(key: string): AdminConfigDefinition | undefined {
  return ADMIN_CONFIG_DEFINITIONS.find((definition) => definition.key === key);
}

export function isEditableAdminConfigKey(key: string): key is EditableAdminConfigKey {
  return findAdminConfigDefinition(key) !== undefined;
}

export function isForbiddenAdminConfigKey(key: string): boolean {
  return FORBIDDEN_ADMIN_CONFIG_KEYS.has(key) || key.startsWith("CLOUDFLARE_") || key.toLowerCase().includes("database");
}

function def(key: string, group: Exclude<AdminConfigGroup, "secrets">, label: string, description: string, valueType: Exclude<AdminConfigValueType, "secret">, options: Omit<AdminConfigDefinition, "key" | "group" | "label" | "description" | "valueType" | "isSecret" | "editable" | "where"> = {}): AdminConfigDefinition {
  return { key, group, label, description, valueType, isSecret: false, editable: true, where: "Dashboard override", ...options };
}

function secret(key: string, label: string, description: string): AdminConfigDefinition {
  return { key, group: "secrets", label, description, valueType: "secret", isSecret: true, editable: true, where: "Encrypted dashboard secret" };
}
