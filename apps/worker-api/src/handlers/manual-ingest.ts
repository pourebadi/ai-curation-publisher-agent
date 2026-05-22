import { IngestGateService, ReviewMessagesRepository, SourcesRepository } from "@curator/db";
import type { ItemStatus, NormalizedPost, ValidationIssue } from "@curator/core";
import { buildTelegramReviewDraft, type ParsedManualTelegramMessage, type TelegramReviewDraft } from "@curator/telegram";
import type { CostControlDecision, D1DatabaseLike } from "@curator/db";

export type ManualIngestResult = {
  itemId: string;
  status: "created" | "duplicate" | "invalid";
  lifecycleStatus: ItemStatus;
  validationIssues: ValidationIssue[];
  costControl: CostControlDecision;
  duplicateOfItemId?: string;
  reviewMessageId?: string;
  reviewChatId?: string;
  reviewDraft?: TelegramReviewDraft;
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
  const ingestGateService = new IngestGateService(db);
  const reviewMessagesRepository = new ReviewMessagesRepository(db);

  const sourcePostId = createManualSourcePostId(parsed);
  const canonicalUrl = parsed.urls[0] ?? `telegram://manual/${parsed.message.chat.id}/${parsed.message.message_id}`;
  const post = createManualNormalizedPost(parsed, sourcePostId, canonicalUrl);

  await sourcesRepository.ensureManualTelegramSource();

  const gateResult = await ingestGateService.process({
    sourceId: "manual_telegram",
    post
  });

  if (gateResult.outcome === "duplicate") {
    return {
      itemId: gateResult.existingItemId ?? `duplicate_${sourcePostId}`,
      status: "duplicate",
      lifecycleStatus: gateResult.status,
      validationIssues: gateResult.validationIssues,
      costControl: gateResult.costControl,
      ...(gateResult.existingItemId === undefined ? {} : { duplicateOfItemId: gateResult.existingItemId })
    };
  }

  if (gateResult.outcome === "invalid") {
    return {
      itemId: `invalid_${sourcePostId}`,
      status: "invalid",
      lifecycleStatus: gateResult.status,
      validationIssues: gateResult.validationIssues,
      costControl: gateResult.costControl
    };
  }

  const item = gateResult.item;
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
    status: "created",
    lifecycleStatus: gateResult.status,
    validationIssues: gateResult.validationIssues,
    costControl: gateResult.costControl,
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
