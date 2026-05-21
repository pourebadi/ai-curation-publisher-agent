import type { D1DatabaseLike } from "../client";

export type ReviewMessageRecord = { id: string; item_id: string; telegram_chat_id: string; telegram_message_id: string; review_status: string; edited_caption?: string; sent_at: string; updated_at: string };

export class ReviewMessagesRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async findByTelegramMessage(chatId: string, messageId: string): Promise<ReviewMessageRecord | null> {
    return this.db.prepare("SELECT * FROM review_messages WHERE telegram_chat_id = ? AND telegram_message_id = ?").bind(chatId, messageId).first<ReviewMessageRecord>();
  }

  async createReviewMessage(): Promise<never> {
    throw new Error("ReviewMessagesRepository.createReviewMessage is intentionally deferred beyond Phase 1");
  }
}
