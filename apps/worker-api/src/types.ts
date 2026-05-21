export interface Env {
  DB: D1Database;
  ENVIRONMENT?: string;
  LOG_LEVEL?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_REVIEW_CHANNEL_ID?: string;
  TELEGRAM_FINAL_CHANNEL_ID?: string;
}

export type JsonResponseBody = Record<string, unknown> | unknown[];
