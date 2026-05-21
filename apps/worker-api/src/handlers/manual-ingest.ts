import { ItemsRepository, ReviewMessagesRepository, SourcesRepository } from "@curator/db";
import type { NormalizedPost } from "@curator/core";
import { buildTelegramReviewDraft, type ParsedManualTelegramMessage, type TelegramReviewDraft } from "@curator/telegram";
import type { D1DatabaseLike } from "@curator/db";

export type ManualIngestResult = {
  itemId: string;
  status: "created" | "duplicate";
  reviewMessageId: string;
  reviewChatId: string;
  reviewDraft: TelegramReviewDraft;
};

export type ManualIngestOptions = {
  reviewChatId?: string;
};

export async function handleManualIngest(
  parsed: ParsedManualTelegramMessage,
  db: D1DatabaseLike,
  options: ManualIngestOptions = {}
): Promise<ManualIngestResult> {
  const sourcesRepository = new SourcesRepository(db);
  const itemsRepository = new ItemsRepository(db);
  const reviewMessagesRepository = new ReviewMessagesRepository(db);

  const sourcePostId = createManualSourcePostId(parsed);
  const canonicalUrl = parsed.urls[0] ?? `telegram://manual/${parsed.message.chat.id}/${parsed.message.message_id}`;

  const existingBySourcePostId = await itemsRepository.findBySourcePostId(sourcePostId);
  const existingByCanonicalUrl = existingBySourcePostId ?? await itemsRepository.findByCanonicalUrl(canonicalUrl);
  const existingItem = existingByCanonicalUrl ?? (
    parsed.urls.length === 0 ? await itemsRepository.findByNormalizedText(parsed.text) : null
  );

  await sourcesRepository.ensureManualTelegramSource();

  const post = createManualNormalizedPost(parsed, sourcePostId, canonicalUrl);
  const item = existingItem ?? await itemsRepository.createFromNormalizedPost({
    sourceId: "manual_telegram",
    status: "sent_to_review",
    post
  });

  const reviewDraft = buildTelegramReviewDraft({
    itemId: item.id,
    caption: parsed.text,
    sourceUrl: canonicalUrl,
    status: item.status,
    links: parsed.urls
  });

  const reviewChatId = options.reviewChatId ?? String(parsed.message.chat.id);
  const reviewMessageId = `mock_review_${parsed.message.message_id}`;
  await reviewMessagesRepository.createReviewMessage({
    itemId: item.id,
    telegramChatId: reviewChatId,
    telegramMessageId: reviewMessageId,
    reviewStatus: "sent"
  });

  return {
    itemId: item.id,
    status: existingItem ? "duplicate" : "created",
    reviewChatId,
    reviewMessageId,
    reviewDraft
  };
}

function createManualNormalizedPost(parsed: ParsedManualTelegramMessage, sourcePostId: string, canonicalUrl: string): NormalizedPost {
  return {
    provider: "mock_social_provider",
    platform: "manual",
    sourceType: parsed.urls.length > 0 ? "web_url" : "manual",
    sourcePostId,
    canonicalUrl,
    publishedAt: new Date((parsed.message.date ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    authorHandle: parsed.message.from?.username ?? `telegram_user_${parsed.reviewerId}`,
    text: parsed.text,
    links: parsed.urls,
    media: [],
    rawPayload: {
      source: "telegram_manual_ingest",
      updateId: parsed.updateId,
      chatId: String(parsed.message.chat.id),
      messageId: parsed.message.message_id
    }
  };
}

function createManualSourcePostId(parsed: ParsedManualTelegramMessage): string {
  return `telegram:${parsed.message.chat.id}:${parsed.message.message_id}`;
}
