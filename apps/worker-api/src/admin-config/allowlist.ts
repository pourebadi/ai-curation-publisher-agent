export type AdminConfigGroup = "operating_mode" | "content_input" | "ai" | "telegram" | "wordpress" | "providers" | "scheduler" | "quotas";
export type AdminConfigValueType = "string" | "boolean" | "integer" | "number" | "url" | "enum" | "model_chain" | "secret";
export type AdminConfigSource = "d1" | "env" | "default" | "missing";
export type AdminConfigSafetyLevel = "safe" | "warning" | "risky";

export type AdminConfigDefinition = {
  key: string;
  group: AdminConfigGroup;
  label: string;
  description: string;
  whereUsed: string;
  valueType: AdminConfigValueType;
  isSecret: boolean;
  editable: true;
  where: "Dashboard override" | "Encrypted dashboard secret";
  safetyLevel: AdminConfigSafetyLevel;
  setupVisible: boolean;
  settingsVisible: boolean;
  requiredForProduction: boolean;
  optionalInManualOnly: boolean;
  defaultValue?: string;
  enumValues?: string[];
  min?: number;
  max?: number;
  maxLength?: number;
  maxItems?: number;
  preferHttps?: boolean;
  allowLocalHttp?: boolean;
};

export const FORBIDDEN_ADMIN_CONFIG_KEYS = new Set([
  "INTERNAL_API_SECRET",
  "CONFIG_ENCRYPTION_KEY",
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "DB",
  "D1_DATABASE_ID",
  "D1_DATABASE_NAME",
  "database_id",
  "SCHEDULER_ENABLED",
  "SCHEDULER_ALLOW_REAL_PROVIDERS",
  "SCHEDULER_ALLOW_PUBLISHING",
  "TELEGRAM_REAL_FINAL_PUBLISH_ENABLED",
  "WORDPRESS_REAL_PUBLISH_ENABLED"
]);

export const ADMIN_CONFIG_DEFINITIONS = [
  def("OPERATING_MODE", "operating_mode", "Operating mode", "Choose how the product should run day to day.", "Controls readiness guidance and which setup steps are required.", "enum", { defaultValue: "manual_only", enumValues: ["manual_only", "mock_demo", "provider_assisted"], safetyLevel: "safe", setupVisible: true, requiredForProduction: true }),
  def("DEFAULT_CONTENT_SOURCE_MODE", "content_input", "Default content input", "Choose whether content is usually added manually, mocked, or provider-assisted.", "Guides dashboard setup and default workflow expectations.", "enum", { defaultValue: "manual", enumValues: ["manual", "mock", "provider"], setupVisible: true, requiredForProduction: true }),
  def("EXTERNAL_LINK_METADATA_ENABLED", "content_input", "External link metadata", "Fetch safe HTML metadata from source links when source text is link-only.", "Used by Telegram topic source ingestion before AI output generation.", "boolean", { defaultValue: "false", safetyLevel: "warning", optionalInManualOnly: true }),
  def("EXTERNAL_LINK_FETCH_TIMEOUT_MS", "content_input", "External link timeout", "Maximum external metadata fetch time in milliseconds.", "Used by Telegram topic source ingestion.", "integer", { defaultValue: "3000", min: 500, max: 10000, optionalInManualOnly: true }),

  def("AI_PROVIDER", "ai", "AI provider", "Choose the AI provider used for processing.", "Controls AI readiness and future AI output calls.", "enum", { defaultValue: "mock", enumValues: ["mock", "openai", "gemini", "custom"], safetyLevel: "warning", setupVisible: true, requiredForProduction: true }),
  def("AI_MODEL", "ai", "Primary AI model", "Primary model ID. Presets are suggestions; manual model IDs are allowed.", "Used by AI processing where implemented.", "string", { defaultValue: "mock", maxLength: 120, setupVisible: true, requiredForProduction: true }),
  def("AI_MODEL_FALLBACKS", "ai", "Fallback model chain", "Ordered fallback model IDs as JSON array or comma-separated list.", "Stored for fallback behavior; runtime fallback is partially implemented and provider-dependent.", "model_chain", { defaultValue: "[]", maxItems: 5, maxLength: 120, setupVisible: true }),
  def("AI_OUTPUT_LANGUAGE", "ai", "Output language", "Preferred output language.", "Used by AI prompt/output behavior.", "enum", { defaultValue: "fa", enumValues: ["fa", "en", "ar", "auto"] }),
  def("AI_TRANSLATION_ENABLED", "ai", "Translation", "Allow AI translation behavior.", "Used by AI output behavior.", "boolean", { defaultValue: "true" }),
  def("AI_REWRITE_ENABLED", "ai", "Rewrite", "Allow AI rewrite behavior.", "Used by AI output behavior.", "boolean", { defaultValue: "true" }),
  def("AI_SUMMARY_ENABLED", "ai", "Summary", "Allow AI summary behavior.", "Used by AI output behavior.", "boolean", { defaultValue: "true" }),
  def("AI_TONE_PRESET", "ai", "Tone preset", "Choose the default editorial tone.", "Used by AI prompt behavior.", "enum", { defaultValue: "neutral", enumValues: ["neutral", "editorial", "concise", "professional", "social", "custom"] }),
  def("AI_CUSTOM_SYSTEM_PROMPT", "ai", "Custom system prompt", "Optional non-secret prompt guidance. Keep it concise and do not paste credentials.", "Used by custom AI prompt behavior.", "string", { defaultValue: "", maxLength: 2000, safetyLevel: "warning" }),
  def("AI_MAX_OUTPUT_TOKENS", "ai", "Max output tokens", "Maximum AI output tokens.", "Used by AI provider request options where implemented.", "integer", { defaultValue: "1200", min: 100, max: 8000, requiredForProduction: true }),
  def("AI_TEMPERATURE", "ai", "Temperature", "Creativity setting from 0 to 2.", "Used by AI provider request options where implemented.", "number", { defaultValue: "0.4", min: 0, max: 2 }),
  def("AI_RETRY_ENABLED", "ai", "AI retry", "Allow safe retry attempts for transient AI errors.", "Used by AI provider orchestration where implemented.", "boolean", { defaultValue: "true" }),
  def("AI_MAX_RETRIES", "ai", "Max AI retries", "Maximum retry attempts.", "Used by AI provider orchestration where implemented.", "integer", { defaultValue: "2", min: 0, max: 5 }),

  def("TELEGRAM_REVIEW_CHAT_ID", "telegram", "Telegram review chat", "Chat where review messages are sent.", "Used by Telegram review dry-run and review workflow.", "string", { setupVisible: true, requiredForProduction: true }),
  def("TELEGRAM_FINAL_CHAT_ID", "telegram", "Telegram final chat", "Final chat id is tracked for readiness only. Dashboard does not publish to it.", "Used only for safe readiness status in this phase.", "string", { safetyLevel: "warning" }),
  def("TELEGRAM_REAL_REVIEW_ENABLED", "telegram", "Telegram review dry-run", "Allows review-channel dry-run when the backend is configured.", "Used by Telegram review dry-run only, not final publishing.", "boolean", { defaultValue: "false", safetyLevel: "warning", setupVisible: true }),
  def("TELEGRAM_FINAL_PUBLISH_ENABLED", "telegram", "Telegram final publishing", "Allows approved Telegram outputs to be published to final channels.", "Used by Telegram Send callbacks and due publish worker.", "boolean", { defaultValue: "false", safetyLevel: "risky", setupVisible: true, requiredForProduction: true }),
  def("GITHUB_MEDIA_PROCESSOR_ENABLED", "telegram", "GitHub media processor", "Dispatches optional GitHub Actions jobs to download external X/Instagram/direct media and stage Telegram file IDs.", "Used by Telegram topic source ingestion when source messages contain external links.", "boolean", { defaultValue: "false", safetyLevel: "warning", optionalInManualOnly: true }),
  def("GITHUB_MEDIA_PROCESSOR_REPOSITORY", "telegram", "Media processor repository", "GitHub repository in owner/name form that contains media-processor.yml.", "Used by Worker workflow_dispatch for optional media processing.", "string", { defaultValue: "", maxLength: 160, optionalInManualOnly: true }),
  def("GITHUB_MEDIA_PROCESSOR_WORKFLOW_ID", "telegram", "Media processor workflow", "Workflow file name or ID for GitHub media processing.", "Used by Worker workflow_dispatch for optional media processing.", "string", { defaultValue: "media-processor.yml", maxLength: 120, optionalInManualOnly: true }),
  def("GITHUB_MEDIA_PROCESSOR_REF", "telegram", "Media processor branch", "Git ref used for workflow_dispatch.", "Used by Worker workflow_dispatch for optional media processing.", "string", { defaultValue: "main", maxLength: 80, optionalInManualOnly: true }),
  def("GITHUB_MEDIA_PROCESSOR_CALLBACK_URL", "telegram", "Media processor callback URL", "Full Worker URL for /internal/media/processing/callback.", "Used by GitHub Actions to register staged Telegram file IDs.", "url", { defaultValue: "", preferHttps: true, allowLocalHttp: true, optionalInManualOnly: true }),
  def("TELEGRAM_MEDIA_STAGING_CHAT_ID", "telegram", "Media staging chat", "Internal Telegram chat where GitHub Actions uploads downloaded media to obtain reusable file IDs.", "Used only by the optional media processor.", "string", { defaultValue: "", optionalInManualOnly: true }),
  def("TELEGRAM_MEDIA_STAGING_THREAD_ID", "telegram", "Media staging topic", "Optional Telegram topic/thread ID for staging uploads.", "Used only by the optional media processor.", "string", { defaultValue: "", maxLength: 32, optionalInManualOnly: true }),
  def("TELEGRAM_MEDIA_MAX_PHOTO_MB", "telegram", "Safe photo limit MB", "Practical Telegram photo limit used before dispatch/publish.", "Used by media processing and validation.", "integer", { defaultValue: "9", min: 1, max: 10, optionalInManualOnly: true }),
  def("TELEGRAM_MEDIA_MAX_FILE_MB", "telegram", "Safe video/file limit MB", "Practical Telegram file limit used before dispatch/publish.", "Used by media processing and validation.", "integer", { defaultValue: "49", min: 1, max: 50, optionalInManualOnly: true }),

  def("WORDPRESS_BASE_URL", "wordpress", "WordPress site URL", "WordPress site used for draft-only checks.", "Used by WordPress draft dry-run.", "url", { preferHttps: true, allowLocalHttp: true, setupVisible: true }),
  def("WORDPRESS_USERNAME", "wordpress", "WordPress username", "WordPress REST username for draft-only checks.", "Used by WordPress draft dry-run.", "string", { setupVisible: true }),
  def("WORDPRESS_DEFAULT_STATUS", "wordpress", "WordPress default status", "WordPress status must remain draft for now.", "Used by WordPress post payload preparation.", "enum", { defaultValue: "draft", enumValues: ["draft"] }),
  def("WORDPRESS_REAL_DRY_RUN_ENABLED", "wordpress", "WordPress draft dry-run", "Allows explicit WordPress draft-only dry-run.", "Used by WordPress draft dry-run only.", "boolean", { defaultValue: "false", safetyLevel: "warning" }),

  def("PROVIDERS_MODE", "providers", "Providers mode", "Provider mode. Keep mock unless intentionally piloting providers.", "Used by provider runtime selection.", "enum", { defaultValue: "mock", enumValues: ["mock", "mixed", "real"], safetyLevel: "warning", optionalInManualOnly: true }),
  def("ENABLE_FIRECRAWL_PROVIDER", "providers", "Enable Firecrawl", "Allows Firecrawl sandbox provider when provider mode permits it.", "Used by provider runtime selection.", "boolean", { defaultValue: "false", safetyLevel: "warning", optionalInManualOnly: true }),
  def("ENABLE_APIFY_PROVIDER", "providers", "Enable Apify", "Allows Apify provider when provider mode permits it.", "Used by provider runtime selection.", "boolean", { defaultValue: "false", safetyLevel: "warning", optionalInManualOnly: true }),
  def("ENABLE_GETXAPI_PROVIDER", "providers", "Enable GetXAPI", "Allows GetXAPI provider when provider mode permits it.", "Used by provider runtime selection.", "boolean", { defaultValue: "false", safetyLevel: "warning", optionalInManualOnly: true }),
  def("FIRECRAWL_BASE_URL", "providers", "Firecrawl endpoint", "Optional Firecrawl endpoint override.", "Used by Firecrawl sandbox fetch.", "url", { defaultValue: "https://api.firecrawl.dev/v1/scrape", preferHttps: true, allowLocalHttp: true, optionalInManualOnly: true }),
  def("FIRECRAWL_TIMEOUT_MS", "providers", "Firecrawl timeout", "Timeout for Firecrawl sandbox requests in milliseconds.", "Used by Firecrawl HTTP client and cost safety.", "integer", { defaultValue: "10000", min: 1000, max: 30000, optionalInManualOnly: true }),

  def("SCHEDULER_DRY_RUN", "scheduler", "Scheduler dry-run", "Keeps scheduler work safe.", "Used by scheduler safety summary and manual dry-run.", "boolean", { defaultValue: "true", requiredForProduction: true }),
  def("SCHEDULER_MAX_SOURCES_PER_RUN", "scheduler", "Scheduler source limit", "Maximum sources per scheduler run.", "Used by scheduler safety and cost limits.", "integer", { defaultValue: "1", min: 0, max: 10 }),
  def("SCHEDULER_MAX_ITEMS_PER_RUN", "scheduler", "Scheduler item limit", "Maximum items per scheduler run.", "Used by scheduler safety and cost limits.", "integer", { defaultValue: "2", min: 0, max: 25 }),
  def("TELEGRAM_PUBLISH_SCHEDULER_ENABLED", "scheduler", "Telegram publish scheduler", "Runs due Telegram publish queue items from the scheduled Worker handler.", "Used by Telegram queue publishing.", "boolean", { defaultValue: "false", safetyLevel: "warning" }),
  def("TELEGRAM_PUBLISH_DUE_LIMIT", "scheduler", "Telegram due publish limit", "Maximum due Telegram publish jobs handled per run.", "Used by Telegram queue publishing.", "integer", { defaultValue: "5", min: 1, max: 25 }),

  def("MAX_AI_ITEMS_PER_RUN", "quotas", "AI item quota", "Maximum AI items per run.", "Used by quota summaries and cost guards.", "integer", { defaultValue: "0", min: 0, max: 25 }),
  def("MAX_PROVIDER_ITEMS_PER_RUN", "quotas", "Provider item quota", "Maximum provider items per run.", "Used by provider/scheduler item caps and cost guards.", "integer", { defaultValue: "5", min: 0, max: 50, optionalInManualOnly: true }),
  def("MAX_PUBLISH_ITEMS_PER_RUN", "quotas", "Publish item quota", "Must remain zero until public publishing is explicitly supported.", "Used by publishing safety summary.", "integer", { defaultValue: "0", min: 0, max: 0, safetyLevel: "safe", requiredForProduction: true }),

  secret("AI_API_KEY", "ai", "Generic AI API key", "Fallback AI credential for configured real AI providers.", { requiredForProduction: true }),
  secret("OPENAI_API_KEY", "ai", "OpenAI API key", "Credential used when AI provider is OpenAI.", { requiredForProduction: false }),
  secret("GEMINI_API_KEY", "ai", "Gemini API key", "Credential used when AI provider is Gemini.", { requiredForProduction: false }),
  secret("CUSTOM_AI_API_KEY", "ai", "Custom AI API key", "Credential used by custom AI provider integrations.", { requiredForProduction: false }),
  secret("TELEGRAM_BOT_TOKEN", "telegram", "Telegram bot token", "Bot token used by the Worker for Telegram review dry-run.", { requiredForProduction: true }),
  secret("TELEGRAM_WEBHOOK_SECRET", "telegram", "Telegram webhook secret", "Shared secret for Telegram webhook verification."),
  secret("GITHUB_MEDIA_PROCESSOR_TOKEN", "telegram", "GitHub media processor token", "Fine-scoped GitHub token with Actions workflow dispatch permission for the media processor repository.", { optionalInManualOnly: true }),
  secret("WORDPRESS_APPLICATION_PASSWORD", "wordpress", "WordPress application password", "WordPress REST application password for draft-only checks."),
  secret("FIRECRAWL_API_KEY", "providers", "Firecrawl API key", "Firecrawl credential for sandbox fetch.", { optionalInManualOnly: true }),
  secret("APIFY_TOKEN", "providers", "Apify token", "Apify credential for provider-assisted mode.", { optionalInManualOnly: true }),
  secret("GETXAPI_KEY", "providers", "GetXAPI key", "GetXAPI credential for provider-assisted mode.", { optionalInManualOnly: true })
] as const satisfies readonly AdminConfigDefinition[];

export type EditableAdminConfigKey = typeof ADMIN_CONFIG_DEFINITIONS[number]["key"];

export function findAdminConfigDefinition(key: string): AdminConfigDefinition | undefined {
  return ADMIN_CONFIG_DEFINITIONS.find((definition) => definition.key === key);
}

export function isEditableAdminConfigKey(key: string): key is EditableAdminConfigKey {
  return findAdminConfigDefinition(key) !== undefined;
}

export function isForbiddenAdminConfigKey(key: string): boolean {
  if (findAdminConfigDefinition(key) !== undefined) return false;
  const normalized = key.toLowerCase();
  return FORBIDDEN_ADMIN_CONFIG_KEYS.has(key)
    || key.startsWith("CLOUDFLARE_")
    || normalized.includes("database")
    || normalized.includes("d1_")
    || normalized.includes("publish_enabled")
    || normalized.includes("allow_publishing");
}

function def(key: string, group: AdminConfigGroup, label: string, description: string, whereUsed: string, valueType: Exclude<AdminConfigValueType, "secret">, options: Partial<Omit<AdminConfigDefinition, "key" | "group" | "label" | "description" | "whereUsed" | "valueType" | "isSecret" | "editable" | "where">> = {}): AdminConfigDefinition {
  return {
    key,
    group,
    label,
    description,
    whereUsed,
    valueType,
    isSecret: false,
    editable: true,
    where: "Dashboard override",
    safetyLevel: options.safetyLevel ?? "safe",
    setupVisible: options.setupVisible ?? false,
    settingsVisible: options.settingsVisible ?? true,
    requiredForProduction: options.requiredForProduction ?? false,
    optionalInManualOnly: options.optionalInManualOnly ?? false,
    ...options
  };
}

function secret(key: string, group: AdminConfigGroup, label: string, description: string, options: Partial<Pick<AdminConfigDefinition, "requiredForProduction" | "optionalInManualOnly">> = {}): AdminConfigDefinition {
  return {
    key,
    group,
    label,
    description,
    whereUsed: "Used internally by the Worker only after decryption.",
    valueType: "secret",
    isSecret: true,
    editable: true,
    where: "Encrypted dashboard secret",
    safetyLevel: "warning",
    setupVisible: true,
    settingsVisible: true,
    requiredForProduction: options.requiredForProduction ?? false,
    optionalInManualOnly: options.optionalInManualOnly ?? false
  };
}
