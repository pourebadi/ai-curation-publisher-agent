import { IngestGateService, ItemsRepository, MediaAssetsRepository, SourcesRepository, TelegramGeneratedOutputsRepository, TelegramReviewMessagesRepository, type TelegramRouteOutputRecord, type TelegramRouteRecord } from "@curator/db";
import type { NormalizedMedia, NormalizedPost } from "@curator/core";
import { buildTelegramOutputReviewDraft, MockTelegramClient, RealTelegramClient, type ParsedManualTelegramMessage, type ParsedTelegramMedia, type TelegramClient } from "@curator/telegram";
import type { Env } from "../types";
import { buildMockLocalizedTelegramOutput } from "./output-orchestrator";

export type TelegramTopicIngestInput = {
  env: Env;
  parsed: ParsedManualTelegramMessage;
  route: TelegramRouteRecord;
  outputs: TelegramRouteOutputRecord[];
  telegramClient?: TelegramClient;
};

export type TelegramTopicIngestResult = {
  ok: true;
  routed: true;
  routeId: string;
  category: string;
  itemId: string;
  generatedOutputCount: number;
  reviewMessageCount: number;
  mediaMetadataCount: number;
  finalPublishingEnabled: false;
};

export async function handleTelegramTopicIngest(input: TelegramTopicIngestInput): Promise<TelegramTopicIngestResult> {
  const sourcesRepository = new SourcesRepository(input.env.DB);
  const ingestGateService = new IngestGateService(input.env.DB);
  const itemsRepository = new ItemsRepository(input.env.DB);
  const mediaAssetsRepository = new MediaAssetsRepository(input.env.DB);
  const generatedOutputsRepository = new TelegramGeneratedOutputsRepository(input.env.DB);
  const reviewMessagesRepository = new TelegramReviewMessagesRepository(input.env.DB);
  const telegramClient = input.telegramClient ?? createTelegramReviewClient(input.env);

  const sourcePostId = createTopicSourcePostId(input.parsed);
  const canonicalUrl = input.parsed.urls[0] ?? `telegram://topic/${input.parsed.chatId}/${input.parsed.threadId ?? "none"}/${input.parsed.messageId}`;
  const sourceAttributionText = `Source: ${canonicalUrl}`;
  const post = createTopicNormalizedPost(input.parsed, sourcePostId, canonicalUrl, input.route);

  await sourcesRepository.ensureManualTelegramSource();
  const gateResult = await ingestGateService.process({ sourceId: "manual_telegram", post });

  if (gateResult.outcome !== "queued") {
    return {
      ok: true,
      routed: true,
      routeId: input.route.id,
      category: input.route.category,
      itemId: gateResult.outcome === "duplicate" ? gateResult.existingItemId ?? `duplicate_${sourcePostId}` : `invalid_${sourcePostId}`,
      generatedOutputCount: 0,
      reviewMessageCount: 0,
      mediaMetadataCount: input.parsed.media.length,
      finalPublishingEnabled: false
    };
  }

  const item = gateResult.item;
  await storeTelegramMediaMetadata(mediaAssetsRepository, item.id, input.parsed.media);

  let generatedOutputCount = 0;
  let reviewMessageCount = 0;

  for (const routeOutput of input.outputs) {
    const localizedOutput = buildMockLocalizedTelegramOutput({
      route: input.route,
      routeOutput,
      post,
      sourceAttributionText
    });
    const generatedOutput = await generatedOutputsRepository.save({
      itemId: item.id,
      routeId: input.route.id,
      routeOutputId: routeOutput.id,
      language: routeOutput.language,
      status: "ready_for_review",
      promptProfile: input.route.promptProfile,
      model: "mock",
      output: localizedOutput,
      inputTokens: estimateTokens(post.text ?? canonicalUrl),
      outputTokens: estimateTokens(localizedOutput.caption)
    });
    generatedOutputCount += 1;

    const draft = buildTelegramOutputReviewDraft({
      generatedOutputId: generatedOutput.id,
      category: input.route.category,
      language: routeOutput.language,
      itemId: item.id,
      sourceUrl: canonicalUrl,
      originalExcerpt: createOriginalExcerpt(input.parsed.text),
      caption: localizedOutput.caption,
      ...(localizedOutput.summary === undefined ? {} : { summary: localizedOutput.summary }),
      riskFlags: localizedOutput.riskFlags,
      status: generatedOutput.status,
      callbackToken: generatedOutput.id
    });
    const sent = await telegramClient.sendReviewMessage({
      chatId: routeOutput.reviewChatId,
      messageThreadId: routeOutput.reviewThreadId,
      text: draft.text,
      replyMarkup: draft.reply_markup
    });
    await reviewMessagesRepository.create({
      generatedOutputId: generatedOutput.id,
      itemId: item.id,
      routeId: input.route.id,
      routeOutputId: routeOutput.id,
      language: routeOutput.language,
      chatId: sent.chatId,
      threadId: routeOutput.reviewThreadId,
      messageId: sent.messageId,
      status: "sent"
    });
    reviewMessageCount += 1;
  }

  await itemsRepository.updateStatus(item.id, "sent_to_review");

  return {
    ok: true,
    routed: true,
    routeId: input.route.id,
    category: input.route.category,
    itemId: item.id,
    generatedOutputCount,
    reviewMessageCount,
    mediaMetadataCount: input.parsed.media.length,
    finalPublishingEnabled: false
  };
}

function createTelegramReviewClient(env: Env): TelegramClient {
  if (env.TELEGRAM_REAL_REVIEW_ENABLED === "true") {
    return new RealTelegramClient({ botToken: env.TELEGRAM_BOT_TOKEN });
  }
  return new MockTelegramClient();
}

function createTopicNormalizedPost(parsed: ParsedManualTelegramMessage, sourcePostId: string, canonicalUrl: string, route: TelegramRouteRecord): NormalizedPost {
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
    media: parsed.media.map(toNormalizedMedia),
    rawPayload: {
      source: "telegram_topic_ingest",
      updateId: parsed.updateId,
      chatId: parsed.chatId,
      threadId: parsed.threadId,
      messageId: parsed.messageId,
      routeId: route.id,
      category: route.category,
      promptProfile: route.promptProfile
    }
  };
}

async function storeTelegramMediaMetadata(repository: MediaAssetsRepository, itemId: string, media: ParsedTelegramMedia[]): Promise<void> {
  await repository.createMany(media.map((entry, index) => ({
    id: `telegram_media_${stableHash(`${itemId}:${entry.fileId}:${index}`)}`,
    itemId,
    kind: mediaKind(entry.kind),
    status: "pending",
    sourceUrl: `telegram://file/${entry.fileId}`,
    ...(entry.mimeType === undefined ? {} : { mimeType: entry.mimeType }),
    ...(entry.fileSize === undefined ? {} : { sizeBytes: entry.fileSize }),
    ...(entry.width === undefined ? {} : { width: entry.width }),
    ...(entry.height === undefined ? {} : { height: entry.height }),
    ...(entry.durationSeconds === undefined ? {} : { durationSeconds: entry.durationSeconds }),
    telegramFileId: entry.fileId,
    ...(entry.fileUniqueId === undefined ? {} : { telegramFileUniqueId: entry.fileUniqueId }),
    ...(entry.mediaGroupId === undefined ? {} : { telegramMediaGroupId: entry.mediaGroupId }),
    telegramFileType: entry.kind,
    ...(entry.mimeType === undefined ? {} : { telegramMimeType: entry.mimeType }),
    ...(entry.fileSize === undefined ? {} : { telegramFileSize: entry.fileSize })
  })));
}

function mediaKind(kind: ParsedTelegramMedia["kind"]): NormalizedMedia["kind"] {
  if (kind === "photo") return "image";
  if (kind === "video" || kind === "animation") return "video";
  return "link_preview";
}

function toNormalizedMedia(media: ParsedTelegramMedia): NormalizedMedia {
  return {
    kind: mediaKind(media.kind),
    sourceUrl: `telegram://file/${media.fileId}`,
    ...(media.mimeType === undefined ? {} : { mimeType: media.mimeType }),
    ...(media.width === undefined ? {} : { width: media.width }),
    ...(media.height === undefined ? {} : { height: media.height }),
    ...(media.durationSeconds === undefined ? {} : { durationSeconds: media.durationSeconds })
  };
}

function createTopicSourcePostId(parsed: ParsedManualTelegramMessage): string {
  return `telegram-topic:${parsed.chatId}:${parsed.threadId ?? "none"}:${parsed.messageId}`;
}

function createOriginalExcerpt(value: string, maxLength = 240): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length <= maxLength ? trimmed : `${trimmed.slice(0, maxLength - 1)}…`;
}

function estimateTokens(value: string): number {
  return Math.max(1, Math.ceil(value.length / 4));
}

function stableHash(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
