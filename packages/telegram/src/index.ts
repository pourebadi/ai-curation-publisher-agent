export const TELEGRAM_REVIEW_ACTIONS = ["edit", "send", "cancel", "status"] as const;
export type TelegramReviewAction = typeof TELEGRAM_REVIEW_ACTIONS[number];
export type TelegramWebhookAck = { ok: true; stub: true; receivedUpdateId?: number };
