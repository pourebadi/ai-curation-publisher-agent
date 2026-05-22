export interface Env {
  DB: D1Database;
  ENVIRONMENT?: string;
  LOG_LEVEL?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_REVIEW_CHAT_ID?: string;
  TELEGRAM_FINAL_CHAT_ID?: string;
  TELEGRAM_ALLOWED_REVIEWER_IDS?: string;
  PROVIDERS_MODE?: string;
  ENABLE_APIFY_PROVIDER?: string;
  ENABLE_GETXAPI_PROVIDER?: string;
  ENABLE_FIRECRAWL_PROVIDER?: string;
  APIFY_TOKEN?: string;
  GETXAPI_KEY?: string;
  FIRECRAWL_API_KEY?: string;
}

export type JsonResponseBody = Record<string, unknown> | unknown[];
