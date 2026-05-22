import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

const files = new Map();

function setFile(filePath, content) {
  files.set(filePath, content.trimEnd() + "\n");
}

setFile(
  "packages/core/src/dedupe.ts",
  String.raw`
import type { NormalizedPost } from "./item";
import type { Platform, SourceType } from "./platform";
import { PLATFORMS, SOURCE_TYPES } from "./platform";

export type DedupeKeyType =
  | "platform_source_post_id"
  | "canonical_url_hash"
  | "normalized_text_hash"
  | "media_url_hash"
  | "fallback_composite";

export type DedupeKeyInput = {
  keyType: DedupeKeyType;
  keyValue: string;
};

export type ValidationIssue = {
  code:
    | "missing_canonical_url"
    | "missing_source_identity"
    | "missing_content"
    | "invalid_platform"
    | "invalid_source_type"
    | "invalid_url";
  message: string;
};

export type ValidationResult = {
  valid: boolean;
  issues: ValidationIssue[];
};

export function stableHash(value: string): string {
  let hash = 5381;

  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizeCanonicalUrl(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("telegram://")) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();

    if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
      url.port = "";
    }

    if (url.pathname.length > 1) {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }

    url.searchParams.sort();

    return url.toString();
  } catch {
    return trimmed.toLowerCase();
  }
}

export function hashCanonicalUrl(value: string): string {
  return stableHash(normalizeCanonicalUrl(value));
}

export function hashNormalizedText(value: string): string {
  return stableHash(normalizeText(value));
}

export function hashMediaUrl(value: string): string {
  return stableHash(normalizeCanonicalUrl(value));
}

export function createStableId(prefix: string, seed: string): string {
  return ` + "`" + `${prefix}_${stableHash(seed)}` + "`" + `;
}

export function generateDedupeKeys(post: NormalizedPost): DedupeKeyInput[] {
  const keys: DedupeKeyInput[] = [];

  if (post.sourcePostId?.trim()) {
    keys.push({
      keyType: "platform_source_post_id",
      keyValue: ` + "`" + `${post.platform}:${post.sourcePostId.trim()}` + "`" + `
    });
  }

  if (post.canonicalUrl.trim()) {
    keys.push({
      keyType: "canonical_url_hash",
      keyValue: hashCanonicalUrl(post.canonicalUrl)
    });
  }

  if (post.text?.trim()) {
    keys.push({
      keyType: "normalized_text_hash",
      keyValue: hashNormalizedText(post.text)
    });
  }

  for (const media of post.media) {
    const mediaUrl = media.canonicalUrl ?? media.sourceUrl;

    if (mediaUrl.trim()) {
      keys.push({
        keyType: "media_url_hash",
        keyValue: hashMediaUrl(mediaUrl)
      });
    }
  }

  keys.push({
    keyType: "fallback_composite",
    keyValue: createFallbackCompositeKey(post)
  });

  return uniqueDedupeKeys(keys);
}

export function createFallbackCompositeKey(post: NormalizedPost): string {
  const seed = [
    post.platform,
    post.sourceType,
    post.publishedAt ?? "",
    post.authorHandle ?? "",
    post.text ? hashNormalizedText(post.text) : "",
    post.links.map(normalizeCanonicalUrl).sort().join("|"),
    post.media.map((media) => hashMediaUrl(media.canonicalUrl ?? media.sourceUrl)).sort().join("|")
  ].join("::");

  return stableHash(seed);
}

export function validateNormalizedPost(post: NormalizedPost): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!isPlatform(post.platform)) {
    issues.push({
      code: "invalid_platform",
      message: "Platform is not supported."
    });
  }

  if (!isSourceType(post.sourceType)) {
    issues.push({
      code: "invalid_source_type",
      message: "Source type is not supported."
    });
  }

  if (!post.canonicalUrl.trim()) {
    issues.push({
      code: "missing_canonical_url",
      message: "Canonical URL is required."
    });
  } else if (!isInternalUrl(post.canonicalUrl) && !looksLikeHttpUrl(post.canonicalUrl)) {
    issues.push({
      code: "invalid_url",
      message: "Canonical URL must be an http, https, or internal Telegram URL."
    });
  }

  const hasFallbackIdentity = Boolean(post.text?.trim()) || post.links.length > 0 || post.media.length > 0;

  if (!post.sourcePostId?.trim() && !hasFallbackIdentity) {
    issues.push({
      code: "missing_source_identity",
      message: "A source post ID or fallback identity is required."
    });
  }

  const hasContent = Boolean(post.text?.trim()) || post.links.length > 0 || post.media.length > 0;

  if (!hasContent) {
    issues.push({
      code: "missing_content",
      message: "Text, link, or media content is required."
    });
  }

  return {
    valid: issues.length === 0,
    issues
  };
}

function uniqueDedupeKeys(keys: DedupeKeyInput[]): DedupeKeyInput[] {
  const seen = new Set<string>();

  return keys.filter((key) => {
    const signature = ` + "`" + `${key.keyType}:${key.keyValue}` + "`" + `;

    if (seen.has(signature)) {
      return false;
    }

    seen.add(signature);

    return true;
  });
}

function isPlatform(value: string): value is Platform {
  return PLATFORMS.includes(value as Platform);
}

function isSourceType(value: string): value is SourceType {
  return SOURCE_TYPES.includes(value as SourceType);
}

function looksLikeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isInternalUrl(value: string): boolean {
  return value.startsWith("telegram://");
}
`
);

setFile(
  "packages/core/src/dedupe.test.ts",
  String.raw`
import { describe, expect, it } from "vitest";
import {
  generateDedupeKeys,
  hashCanonicalUrl,
  hashMediaUrl,
  hashNormalizedText,
  normalizeCanonicalUrl,
  normalizeText
} from "./dedupe";
import type { NormalizedPost } from "./item";

function makePost(overrides: Partial<NormalizedPost> = {}): NormalizedPost {
  return {
    provider: "mock_social_provider",
    platform: "manual",
    sourceType: "web_url",
    sourcePostId: "post-local",
    canonicalUrl: "https://source.local/post?b=2&a=1#section",
    text: "  Same   TEXT ",
    links: ["https://source.local/post"],
    media: [
      {
        kind: "image",
        sourceUrl: "https://source.local/image.png"
      }
    ],
    rawPayload: {},
    ...overrides
  };
}

describe("dedupe key generation", () => {
  it("normalizes text before hashing", () => {
    expect(normalizeText("  Same   TEXT ")).toBe("same text");
    expect(hashNormalizedText("Same TEXT")).toBe(hashNormalizedText(" same   text "));
  });

  it("normalizes canonical URLs before hashing", () => {
    expect(normalizeCanonicalUrl("HTTPS://SOURCE.LOCAL/post?b=2&a=1#ignored")).toBe(
      "https://source.local/post?a=1&b=2"
    );

    expect(hashCanonicalUrl("https://source.local/post?a=1&b=2")).toBe(
      hashCanonicalUrl("https://source.local/post?b=2&a=1#ignored")
    );
  });

  it("hashes media URLs with the same canonical URL strategy", () => {
    expect(hashMediaUrl("https://source.local/media.png?b=2&a=1")).toBe(
      hashMediaUrl("https://source.local/media.png?a=1&b=2")
    );
  });

  it("generates exact, URL, text, media, and fallback keys", () => {
    const keys = generateDedupeKeys(makePost());

    expect(keys.map((key) => key.keyType)).toEqual([
      "platform_source_post_id",
      "canonical_url_hash",
      "normalized_text_hash",
      "media_url_hash",
      "fallback_composite"
    ]);
  });

  it("always generates a fallback composite key", () => {
    const keys = generateDedupeKeys(
      makePost({
        sourcePostId: undefined,
        text: undefined,
        media: [],
        links: ["https://source.local/fallback"]
      })
    );

    expect(keys.some((key) => key.keyType === "fallback_composite")).toBe(true);
  });
});
`
);

setFile(
  "packages/core/src/index.ts",
  String.raw`
export * from "./platform";
export * from "./lifecycle";
export * from "./dedupe";
export * from "./media";
export * from "./source";
export * from "./item";
export * from "./output";
export * from "./provider";
export * from "./queue";
export * from "./settings";
`
);

setFile(
  "packages/core/src/lifecycle.ts",
  String.raw`
export const ACTIVE_ITEM_STATUSES = [
  "discovered",
  "normalized",
  "validated",
  "queued_for_ai",
  "ai_processed",
  "media_ready",
  "sent_to_review",
  "approved",
  "queued_for_publish",
  "published_telegram",
  "published_wordpress",
  "archived"
] as const;

export const FAILURE_ITEM_STATUSES = [
  "duplicate_skipped",
  "invalid",
  "failed",
  "retry_pending",
  "cancelled"
] as const;

export const ITEM_STATUSES = [...ACTIVE_ITEM_STATUSES, ...FAILURE_ITEM_STATUSES] as const;
export type ItemStatus = typeof ITEM_STATUSES[number];

export const TERMINAL_ITEM_STATUSES = [
  "archived",
  "duplicate_skipped",
  "invalid",
  "cancelled"
] as const satisfies readonly ItemStatus[];

const TRANSITIONS: Record<ItemStatus, readonly ItemStatus[]> = {
  discovered: ["normalized", "duplicate_skipped", "invalid", "failed"],
  normalized: ["validated", "duplicate_skipped", "invalid", "failed"],
  validated: ["queued_for_ai", "failed", "cancelled"],
  queued_for_ai: ["ai_processed", "retry_pending", "failed", "cancelled"],
  ai_processed: ["media_ready", "sent_to_review", "failed", "cancelled"],
  media_ready: ["sent_to_review", "failed", "cancelled"],
  sent_to_review: ["approved", "cancelled", "retry_pending", "failed"],
  approved: ["queued_for_publish", "cancelled", "failed"],
  queued_for_publish: ["published_telegram", "retry_pending", "failed", "cancelled"],
  published_telegram: ["published_wordpress", "retry_pending", "failed"],
  published_wordpress: ["archived"],
  archived: [],
  duplicate_skipped: [],
  invalid: [],
  failed: ["retry_pending"],
  retry_pending: ["queued_for_ai", "queued_for_publish", "sent_to_review", "failed", "cancelled"],
  cancelled: []
};

export function isItemStatus(value: string): value is ItemStatus {
  return ITEM_STATUSES.includes(value as ItemStatus);
}

export function isTerminalItemStatus(status: ItemStatus): boolean {
  return TERMINAL_ITEM_STATUSES.includes(status as typeof TERMINAL_ITEM_STATUSES[number]);
}

export function canTransitionItemStatus(from: ItemStatus, to: ItemStatus): boolean {
  if (from === to) {
    return true;
  }

  return TRANSITIONS[from].includes(to);
}

export function assertItemStatusTransition(from: ItemStatus, to: ItemStatus): void {
  if (!canTransitionItemStatus(from, to)) {
    throw new Error(` + "`" + `Invalid item lifecycle transition: ${from} -> ${to}` + "`" + `);
  }
}

export function canEnterCostlyProcessing(status: ItemStatus): boolean {
  return status === "queued_for_ai";
}
`
);

setFile(
  "packages/core/src/lifecycle.test.ts",
  String.raw`
import { describe, expect, it } from "vitest";
import {
  assertItemStatusTransition,
  canEnterCostlyProcessing,
  canTransitionItemStatus,
  isItemStatus,
  isTerminalItemStatus
} from "./lifecycle";

describe("item lifecycle", () => {
  it("allows expected forward transitions", () => {
    expect(canTransitionItemStatus("discovered", "normalized")).toBe(true);
    expect(canTransitionItemStatus("normalized", "validated")).toBe(true);
    expect(canTransitionItemStatus("published_telegram", "published_wordpress")).toBe(true);
  });

  it("blocks expensive processing after duplicate skip", () => {
    expect(canTransitionItemStatus("duplicate_skipped", "queued_for_ai")).toBe(false);
    expect(canTransitionItemStatus("duplicate_skipped", "media_ready")).toBe(false);
  });

  it("recognizes known and terminal statuses", () => {
    expect(isItemStatus("sent_to_review")).toBe(true);
    expect(isItemStatus("made_up_status")).toBe(false);
    expect(isTerminalItemStatus("cancelled")).toBe(true);
  });

  it("throws for invalid transitions", () => {
    expect(() => assertItemStatusTransition("discovered", "queued_for_ai")).toThrow(
      "Invalid item lifecycle transition"
    );
    expect(() => assertItemStatusTransition("discovered", "normalized")).not.toThrow();
  });

  it("allows costly processing only after validation has queued the item for AI", () => {
    expect(canEnterCostlyProcessing("queued_for_ai")).toBe(true);
    expect(canEnterCostlyProcessing("duplicate_skipped")).toBe(false);
    expect(canEnterCostlyProcessing("invalid")).toBe(false);
    expect(canEnterCostlyProcessing("discovered")).toBe(false);
    expect(canEnterCostlyProcessing("validated")).toBe(false);
  });
});
`
);

setFile(
  "packages/core/src/validation.test.ts",
  String.raw`
import { describe, expect, it } from "vitest";
import { validateNormalizedPost } from "./dedupe";
import type { NormalizedPost } from "./item";

function makePost(overrides: Partial<NormalizedPost> = {}): NormalizedPost {
  return {
    provider: "mock_social_provider",
    platform: "manual",
    sourceType: "manual",
    sourcePostId: "local-message",
    canonicalUrl: "telegram://manual/chat/message",
    text: "Manual input",
    links: [],
    media: [],
    rawPayload: {},
    ...overrides
  };
}

describe("validateNormalizedPost", () => {
  it("accepts a valid manual text post", () => {
    expect(validateNormalizedPost(makePost()).valid).toBe(true);
  });

  it("requires a canonical URL", () => {
    const result = validateNormalizedPost(makePost({ canonicalUrl: "" }));

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("missing_canonical_url");
  });

  it("requires source identity or fallback identity", () => {
    const result = validateNormalizedPost(
      makePost({
        sourcePostId: undefined,
        text: undefined,
        links: [],
        media: []
      })
    );

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("missing_source_identity");
  });

  it("requires text, link, or media content", () => {
    const result = validateNormalizedPost(
      makePost({
        text: " ",
        links: [],
        media: []
      })
    );

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("missing_content");
  });

  it("rejects unsupported platforms and source types", () => {
    const result = validateNormalizedPost(
      makePost({
        platform: "unsupported" as NormalizedPost["platform"],
        sourceType: "unsupported" as NormalizedPost["sourceType"]
      })
    );

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("invalid_platform");
    expect(result.issues.map((issue) => issue.code)).toContain("invalid_source_type");
  });
});
`
);

setFile(
  "packages/db/src/repositories/dedupe-keys.repository.ts",
  String.raw`
import { createStableId, type DedupeKeyInput, type DedupeKeyType } from "@curator/core";
import type { D1DatabaseLike } from "../client";

type DedupeKeyRow = {
  id: string;
  item_id: string;
  key_type: DedupeKeyType;
  key_value: string;
  created_at: string;
};

export type DedupeKeyRecord = {
  id: string;
  itemId: string;
  keyType: DedupeKeyType;
  keyValue: string;
  createdAt: string;
};

export class DedupeKeysRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async findExisting(keys: DedupeKeyInput[]): Promise<DedupeKeyRecord | null> {
    for (const key of keys) {
      const row = await this.db
        .prepare("SELECT id, item_id, key_type, key_value, created_at FROM dedupe_keys WHERE key_type = ? AND key_value = ? LIMIT 1")
        .bind(key.keyType, key.keyValue)
        .first<DedupeKeyRow>();

      if (row) {
        return toDedupeKeyRecord(row);
      }
    }

    return null;
  }

  async createMany(itemId: string, keys: DedupeKeyInput[]): Promise<void> {
    for (const key of keys) {
      await this.db
        .prepare("INSERT OR IGNORE INTO dedupe_keys (id, item_id, key_type, key_value) VALUES (?, ?, ?, ?)")
        .bind(createStableId(` + "`" + `dedupe_${key.keyType}` + "`" + `, key.keyValue), itemId, key.keyType, key.keyValue)
        .run();
    }
  }
}

function toDedupeKeyRecord(row: DedupeKeyRow): DedupeKeyRecord {
  return {
    id: row.id,
    itemId: row.item_id,
    keyType: row.key_type,
    keyValue: row.key_value,
    createdAt: row.created_at
  };
}
`
);

setFile(
  "packages/db/src/repositories/items.repository.ts",
  String.raw`
import { createStableId, hashCanonicalUrl, hashNormalizedText, normalizeText, stableHash } from "@curator/core";
import type { Item, ItemStatus, NormalizedPost } from "@curator/core";
import type { D1DatabaseLike } from "../client";

export type CreateItemFromNormalizedPostInput = {
  sourceId: string;
  status?: ItemStatus;
  post: NormalizedPost;
};

export class ItemsRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async findById(id: string): Promise<Item | null> {
    return this.db.prepare("SELECT * FROM items WHERE id = ?").bind(id).first<Item>();
  }

  async findBySourcePostId(sourcePostId: string): Promise<Item | null> {
    return this.db.prepare("SELECT * FROM items WHERE source_post_id = ?").bind(sourcePostId).first<Item>();
  }

  async findByCanonicalUrl(canonicalUrl: string): Promise<Item | null> {
    return this.db
      .prepare("SELECT * FROM items WHERE canonical_url_hash = ?")
      .bind(hashCanonicalUrl(canonicalUrl))
      .first<Item>();
  }

  async findByNormalizedText(text: string): Promise<Item | null> {
    return this.db
      .prepare("SELECT * FROM items WHERE normalized_text_hash = ?")
      .bind(hashNormalizedText(text))
      .first<Item>();
  }

  async updateStatus(id: string, status: ItemStatus): Promise<void> {
    await this.db.prepare("UPDATE items SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(status, id).run();
  }

  async createFromNormalizedPost(input: CreateItemFromNormalizedPostInput): Promise<Item> {
    const now = new Date().toISOString();
    const item: Item = {
      id: createStableId("item", input.post.sourcePostId ?? input.post.canonicalUrl),
      sourceId: input.sourceId,
      provider: input.post.provider,
      platform: input.post.platform,
      sourceType: input.post.sourceType,
      ...(input.post.sourcePostId === undefined ? {} : { sourcePostId: input.post.sourcePostId }),
      canonicalUrl: input.post.canonicalUrl,
      canonicalUrlHash: hashCanonicalUrl(input.post.canonicalUrl),
      ...(input.post.text === undefined ? {} : { normalizedTextHash: hashNormalizedText(input.post.text) }),
      status: input.status ?? "discovered",
      ...(input.post.publishedAt === undefined ? {} : { publishedAt: input.post.publishedAt }),
      ...(input.post.authorHandle === undefined ? {} : { authorHandle: input.post.authorHandle }),
      ...(input.post.text === undefined ? {} : { text: input.post.text }),
      links: input.post.links,
      rawPayload: input.post.rawPayload,
      createdAt: now,
      updatedAt: now
    };

    await this.db.prepare(
      ` + "`" + `INSERT INTO items (id, source_id, provider, platform, source_type, source_post_id, canonical_url, canonical_url_hash, normalized_text_hash, status, published_at, author_handle, text, links_json, raw_payload_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` + "`" + `
    ).bind(
      item.id,
      item.sourceId,
      item.provider,
      item.platform,
      item.sourceType,
      item.sourcePostId ?? null,
      item.canonicalUrl,
      item.canonicalUrlHash,
      item.normalizedTextHash ?? null,
      item.status,
      item.publishedAt ?? null,
      item.authorHandle ?? null,
      item.text ?? null,
      JSON.stringify(item.links),
      JSON.stringify(item.rawPayload),
      item.createdAt,
      item.updatedAt
    ).run();

    return item;
  }
}

export { normalizeText, stableHash };

export function createId(prefix: string, seed: string): string {
  return createStableId(prefix, seed);
}
`
);

setFile(
  "packages/db/src/services/dedupe.service.ts",
  String.raw`
import { generateDedupeKeys, type DedupeKeyInput } from "@curator/core";
import type { NormalizedPost } from "@curator/core";
import type { DedupeKeyRecord, DedupeKeysRepository } from "../repositories/dedupe-keys.repository";

export type DedupeCheckResult = {
  duplicate: boolean;
  keys: DedupeKeyInput[];
  matchedKey?: DedupeKeyRecord;
  existingItemId?: string;
};

export class DedupeService {
  constructor(private readonly dedupeKeysRepository: DedupeKeysRepository) {}

  async check(post: NormalizedPost): Promise<DedupeCheckResult> {
    const keys = generateDedupeKeys(post);
    const matchedKey = await this.dedupeKeysRepository.findExisting(keys);

    if (!matchedKey) {
      return {
        duplicate: false,
        keys
      };
    }

    return {
      duplicate: true,
      keys,
      matchedKey,
      existingItemId: matchedKey.itemId
    };
  }

  async recordItem(itemId: string, post: NormalizedPost): Promise<void> {
    await this.dedupeKeysRepository.createMany(itemId, generateDedupeKeys(post));
  }
}
`
);

setFile(
  "packages/db/src/services/ingest-gate.service.ts",
  String.raw`
import {
  assertItemStatusTransition,
  validateNormalizedPost,
  type DedupeKeyInput,
  type Item,
  type ItemStatus,
  type NormalizedPost,
  type ValidationIssue
} from "@curator/core";
import type { D1DatabaseLike } from "../client";
import { DedupeKeysRepository } from "../repositories/dedupe-keys.repository";
import { ItemsRepository } from "../repositories/items.repository";
import { DedupeService } from "./dedupe.service";
import { LifecycleService } from "./lifecycle.service";

export type IngestGateInput = {
  sourceId: string;
  post: NormalizedPost;
};

export type CostControlDecision = {
  entersAiQueue: boolean;
  entersMediaQueue: boolean;
  entersReviewQueue: boolean;
};

export type IngestGateResult = {
  outcome: "queued" | "duplicate" | "invalid";
  status: ItemStatus;
  keys: DedupeKeyInput[];
  validationIssues: ValidationIssue[];
  costControl: CostControlDecision;
  item?: Item;
  existingItemId?: string;
};

export class IngestGateService {
  private readonly itemsRepository: ItemsRepository;
  private readonly dedupeService: DedupeService;
  private readonly lifecycleService: LifecycleService;

  constructor(db: D1DatabaseLike) {
    this.itemsRepository = new ItemsRepository(db);
    this.dedupeService = new DedupeService(new DedupeKeysRepository(db));
    this.lifecycleService = new LifecycleService(this.itemsRepository);
  }

  async processNormalizedPost(input: IngestGateInput): Promise<IngestGateResult> {
    const validation = validateNormalizedPost(input.post);
    const dedupe = await this.dedupeService.check(input.post);

    if (!validation.valid) {
      return {
        outcome: "invalid",
        status: "invalid",
        keys: dedupe.keys,
        validationIssues: validation.issues,
        costControl: blockedCostControl()
      };
    }

    if (dedupe.duplicate) {
      return {
        outcome: "duplicate",
        status: "duplicate_skipped",
        keys: dedupe.keys,
        validationIssues: [],
        costControl: blockedCostControl(),
        ...(dedupe.existingItemId === undefined ? {} : { existingItemId: dedupe.existingItemId })
      };
    }

    const item = await this.itemsRepository.createFromNormalizedPost({
      sourceId: input.sourceId,
      status: "discovered",
      post: input.post
    });

    await this.transitionItem(item.id, "discovered", "normalized");
    await this.transitionItem(item.id, "normalized", "validated");
    await this.transitionItem(item.id, "validated", "queued_for_ai");
    await this.dedupeService.recordItem(item.id, input.post);

    return {
      outcome: "queued",
      status: "queued_for_ai",
      keys: dedupe.keys,
      validationIssues: [],
      costControl: {
        entersAiQueue: true,
        entersMediaQueue: false,
        entersReviewQueue: false
      },
      item: {
        ...item,
        status: "queued_for_ai"
      }
    };
  }

  private async transitionItem(itemId: string, from: ItemStatus, to: ItemStatus): Promise<void> {
    assertItemStatusTransition(from, to);
    await this.lifecycleService.transitionItem(itemId, from, to);
  }
}

function blockedCostControl(): CostControlDecision {
  return {
    entersAiQueue: false,
    entersMediaQueue: false,
    entersReviewQueue: false
  };
}
`
);

setFile(
  "packages/db/src/services/ingest-gate.service.test.ts",
  String.raw`
import { describe, expect, it } from "vitest";
import { IngestGateService } from "./ingest-gate.service";
import type { D1DatabaseLike, D1PreparedStatementLike, D1RunResult, D1Result, D1Value } from "../client";
import type { Item, NormalizedPost } from "@curator/core";

type DedupeKeyRow = {
  id: string;
  item_id: string;
  key_type: string;
  key_value: string;
  created_at: string;
};

class FakeStatement implements D1PreparedStatementLike {
  private values: D1Value[] = [];

  constructor(private readonly db: FakeDb, private readonly query: string) {}

  bind(...values: D1Value[]): D1PreparedStatementLike {
    this.values = values;
    return this;
  }

  async first<T = unknown>(): Promise<T | null> {
    if (this.query.includes("FROM dedupe_keys")) {
      const keyType = String(this.values[0] ?? "");
      const keyValue = String(this.values[1] ?? "");
      return (this.db.dedupeKeys.find((key) => key.key_type === keyType && key.key_value === keyValue) as T | undefined) ?? null;
    }

    return null;
  }

  async all<T = unknown>(): Promise<D1Result<T>> {
    return { success: true, results: [] };
  }

  async run(): Promise<D1RunResult> {
    if (this.query.includes("INSERT INTO items")) {
      this.db.items.push({
        id: String(this.values[0]),
        sourceId: String(this.values[1]),
        provider: String(this.values[2]),
        platform: this.values[3] as Item["platform"],
        sourceType: this.values[4] as Item["sourceType"],
        ...(this.values[5] === null ? {} : { sourcePostId: String(this.values[5]) }),
        canonicalUrl: String(this.values[6]),
        canonicalUrlHash: String(this.values[7]),
        ...(this.values[8] === null ? {} : { normalizedTextHash: String(this.values[8]) }),
        status: this.values[9] as Item["status"],
        ...(this.values[10] === null ? {} : { publishedAt: String(this.values[10]) }),
        ...(this.values[11] === null ? {} : { authorHandle: String(this.values[11]) }),
        ...(this.values[12] === null ? {} : { text: String(this.values[12]) }),
        links: JSON.parse(String(this.values[13])) as string[],
        rawPayload: JSON.parse(String(this.values[14])) as Record<string, unknown>,
        createdAt: String(this.values[15]),
        updatedAt: String(this.values[16])
      });
    }

    if (this.query.includes("UPDATE items SET status")) {
      const status = String(this.values[0]);
      const itemId = String(this.values[1]);
      const item = this.db.items.find((candidate) => candidate.id === itemId);

      if (item) {
        item.status = status as Item["status"];
      }
    }

    if (this.query.includes("INSERT OR IGNORE INTO dedupe_keys")) {
      this.db.dedupeKeys.push({
        id: String(this.values[0]),
        item_id: String(this.values[1]),
        key_type: String(this.values[2]),
        key_value: String(this.values[3]),
        created_at: new Date().toISOString()
      });
    }

    return { success: true, changes: 1 };
  }
}

class FakeDb implements D1DatabaseLike {
  items: Item[] = [];
  dedupeKeys: DedupeKeyRow[] = [];

  prepare(query: string): D1PreparedStatementLike {
    return new FakeStatement(this, query);
  }
}

function makePost(overrides: Partial<NormalizedPost> = {}): NormalizedPost {
  return {
    provider: "mock_social_provider",
    platform: "manual",
    sourceType: "web_url",
    sourcePostId: "manual-message",
    canonicalUrl: "https://source.local/post",
    text: "Manual post",
    links: ["https://source.local/post"],
    media: [],
    rawPayload: {},
    ...overrides
  };
}

describe("IngestGateService", () => {
  it("moves valid new items through discovered, normalized, validated, and queued_for_ai", async () => {
    const db = new FakeDb();
    const service = new IngestGateService(db);

    const result = await service.processNormalizedPost({
      sourceId: "manual_telegram",
      post: makePost()
    });

    expect(result.outcome).toBe("queued");
    expect(result.status).toBe("queued_for_ai");
    expect(result.costControl.entersAiQueue).toBe(true);
    expect(result.costControl.entersMediaQueue).toBe(false);
    expect(result.costControl.entersReviewQueue).toBe(false);
    expect(db.items).toHaveLength(1);
    expect(db.items[0].status).toBe("queued_for_ai");
    expect(db.dedupeKeys.length).toBeGreaterThan(0);
  });

  it("blocks duplicate items from costly processing", async () => {
    const db = new FakeDb();
    const service = new IngestGateService(db);

    const first = await service.processNormalizedPost({
      sourceId: "manual_telegram",
      post: makePost()
    });
    const second = await service.processNormalizedPost({
      sourceId: "manual_telegram",
      post: makePost({ sourcePostId: "different-message" })
    });

    expect(first.outcome).toBe("queued");
    expect(second.outcome).toBe("duplicate");
    expect(second.status).toBe("duplicate_skipped");
    expect(second.existingItemId).toBe(first.item?.id);
    expect(second.costControl.entersAiQueue).toBe(false);
    expect(second.costControl.entersMediaQueue).toBe(false);
    expect(second.costControl.entersReviewQueue).toBe(false);
    expect(db.items).toHaveLength(1);
  });

  it("blocks invalid items from costly processing", async () => {
    const db = new FakeDb();
    const service = new IngestGateService(db);

    const result = await service.processNormalizedPost({
      sourceId: "manual_telegram",
      post: makePost({ canonicalUrl: "", text: " " })
    });

    expect(result.outcome).toBe("invalid");
    expect(result.status).toBe("invalid");
    expect(result.validationIssues.length).toBeGreaterThan(0);
    expect(result.costControl.entersAiQueue).toBe(false);
    expect(result.costControl.entersMediaQueue).toBe(false);
    expect(result.costControl.entersReviewQueue).toBe(false);
    expect(db.items).toHaveLength(0);
  });
});
`
);

setFile(
  "packages/db/src/services/lifecycle.service.ts",
  String.raw`
import { assertItemStatusTransition, type ItemStatus } from "@curator/core";
import { ItemsRepository } from "../repositories/items.repository";

export class LifecycleService {
  constructor(private readonly itemsRepository: ItemsRepository) {}

  async transitionItem(itemId: string, from: ItemStatus, to: ItemStatus): Promise<void> {
    assertItemStatusTransition(from, to);
    await this.itemsRepository.updateStatus(itemId, to);
  }
}
`
);

setFile(
  "packages/db/src/index.ts",
  String.raw`
export * from "./client";
export * from "./repositories/items.repository";
export * from "./repositories/sources.repository";
export * from "./repositories/outputs.repository";
export * from "./repositories/review-messages.repository";
export * from "./repositories/review-actions.repository";
export * from "./repositories/dedupe-keys.repository";
export * from "./services/dedupe.service";
export * from "./services/ingest-gate.service";
export * from "./services/lifecycle.service";
`
);

setFile(
  "apps/worker-api/src/handlers/manual-ingest.ts",
  String.raw`
import { IngestGateService, ReviewMessagesRepository, SourcesRepository } from "@curator/db";
import type { ItemStatus, NormalizedPost, ValidationIssue } from "@curator/core";
import { buildTelegramReviewDraft, type ParsedManualTelegramMessage, type TelegramReviewDraft } from "@curator/telegram";
import type { D1DatabaseLike } from "@curator/db";

export type ManualIngestResult = {
  itemId: string;
  status: "created" | "duplicate" | "invalid";
  lifecycleStatus: ItemStatus;
  validationIssues: ValidationIssue[];
  costControl: {
    entersAiQueue: boolean;
    entersMediaQueue: boolean;
    entersReviewQueue: boolean;
  };
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
  const canonicalUrl = parsed.urls[0] ?? ` + "`" + `telegram://manual/${parsed.message.chat.id}/${parsed.message.message_id}` + "`" + `;
  const post = createManualNormalizedPost(parsed, sourcePostId, canonicalUrl);

  await sourcesRepository.ensureManualTelegramSource();

  const gateResult = await ingestGateService.processNormalizedPost({
    sourceId: "manual_telegram",
    post
  });

  if (gateResult.outcome !== "queued") {
    const itemId = gateResult.existingItemId ?? ` + "`" + `manual_rejected_${parsed.message.chat.id}_${parsed.message.message_id}` + "`" + `;

    return {
      itemId,
      status: gateResult.outcome === "duplicate" ? "duplicate" : "invalid",
      lifecycleStatus: gateResult.status,
      validationIssues: gateResult.validationIssues,
      costControl: gateResult.costControl,
      ...(gateResult.existingItemId === undefined ? {} : { duplicateOfItemId: gateResult.existingItemId })
    };
  }

  const item = gateResult.item;
  if (!item) {
    throw new Error("Ingest gate did not return a queued item.");
  }

  const reviewDraft = buildTelegramReviewDraft({
    itemId: item.id,
    caption: parsed.text,
    sourceUrl: canonicalUrl,
    status: item.status,
    links: parsed.urls
  });

  const reviewChatId = options.reviewChatId ?? String(parsed.message.chat.id);
  const reviewMessageId = ` + "`" + `mock_review_${parsed.message.message_id}` + "`" + `;
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
    authorHandle: parsed.message.from?.username ?? ` + "`" + `telegram_user_${parsed.reviewerId}` + "`" + `,
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
  return ` + "`" + `telegram:${parsed.message.chat.id}:${parsed.message.message_id}` + "`" + `;
}
`
);

setFile(
  "apps/worker-api/src/handlers/manual-ingest.test.ts",
  String.raw`
import { describe, expect, it } from "vitest";
import { parseTelegramUpdate } from "@curator/telegram";
import { handleManualIngest } from "./manual-ingest";
import type { D1DatabaseLike, D1PreparedStatementLike, D1RunResult, D1Result, D1Value } from "@curator/db";
import type { Item } from "@curator/core";

type InsertedRow = {
  query: string;
  values: D1Value[];
};

type DedupeKeyRow = {
  id: string;
  item_id: string;
  key_type: string;
  key_value: string;
  created_at: string;
};

class FakeStatement implements D1PreparedStatementLike {
  private values: D1Value[] = [];

  constructor(private readonly db: FakeDb, private readonly query: string) {}

  bind(...values: D1Value[]): D1PreparedStatementLike {
    this.values = values;
    return this;
  }

  async first<T = unknown>(): Promise<T | null> {
    const lookupValue = String(this.values[0] ?? "");

    if (this.query.includes("FROM dedupe_keys")) {
      const keyType = String(this.values[0] ?? "");
      const keyValue = String(this.values[1] ?? "");
      const match = this.db.dedupeKeys.find((key) => key.key_type === keyType && key.key_value === keyValue);
      return (match as T | undefined) ?? null;
    }

    if (this.query.includes("FROM items WHERE source_post_id")) {
      return (this.db.items.find((item) => item.sourcePostId === lookupValue) as T | undefined) ?? null;
    }

    if (this.query.includes("FROM items WHERE canonical_url_hash")) {
      return (this.db.items.find((item) => item.canonicalUrlHash === lookupValue) as T | undefined) ?? null;
    }

    if (this.query.includes("FROM items WHERE normalized_text_hash")) {
      return (this.db.items.find((item) => item.normalizedTextHash === lookupValue) as T | undefined) ?? null;
    }

    return null;
  }

  async all<T = unknown>(): Promise<D1Result<T>> {
    return { success: true, results: [] };
  }

  async run(): Promise<D1RunResult> {
    this.db.insertedRows.push({ query: this.query, values: this.values });

    if (this.query.includes("INSERT INTO items")) {
      const item: Item = {
        id: String(this.values[0]),
        sourceId: String(this.values[1]),
        provider: String(this.values[2]),
        platform: this.values[3] as Item["platform"],
        sourceType: this.values[4] as Item["sourceType"],
        ...(this.values[5] === null ? {} : { sourcePostId: String(this.values[5]) }),
        canonicalUrl: String(this.values[6]),
        canonicalUrlHash: String(this.values[7]),
        ...(this.values[8] === null ? {} : { normalizedTextHash: String(this.values[8]) }),
        status: this.values[9] as Item["status"],
        ...(this.values[10] === null ? {} : { publishedAt: String(this.values[10]) }),
        ...(this.values[11] === null ? {} : { authorHandle: String(this.values[11]) }),
        ...(this.values[12] === null ? {} : { text: String(this.values[12]) }),
        links: JSON.parse(String(this.values[13])) as string[],
        rawPayload: JSON.parse(String(this.values[14])) as Record<string, unknown>,
        createdAt: String(this.values[15]),
        updatedAt: String(this.values[16])
      };

      this.db.items.push(item);
    }

    if (this.query.includes("UPDATE items SET status")) {
      const status = String(this.values[0]);
      const itemId = String(this.values[1]);
      const item = this.db.items.find((candidate) => candidate.id === itemId);

      if (item) {
        item.status = status as Item["status"];
      }
    }

    if (this.query.includes("INSERT OR IGNORE INTO dedupe_keys")) {
      const row: DedupeKeyRow = {
        id: String(this.values[0]),
        item_id: String(this.values[1]),
        key_type: String(this.values[2]),
        key_value: String(this.values[3]),
        created_at: new Date().toISOString()
      };

      if (!this.db.dedupeKeys.some((key) => key.key_type === row.key_type && key.key_value === row.key_value)) {
        this.db.dedupeKeys.push(row);
      }
    }

    return { success: true, changes: 1 };
  }
}

class FakeDb implements D1DatabaseLike {
  insertedRows: InsertedRow[] = [];
  items: Item[] = [];
  dedupeKeys: DedupeKeyRow[] = [];

  prepare(query: string): D1PreparedStatementLike {
    return new FakeStatement(this, query);
  }
}

describe("handleManualIngest", () => {
  it("creates a manual item and review metadata from Telegram text", async () => {
    const parsed = parseTelegramUpdate({
      update_id: 11,
      message: {
        message_id: 22,
        from: { id: 33, first_name: "Reviewer" },
        chat: { id: 44, type: "private" },
        text: "Manual item https://source.local/post"
      }
    });

    if (parsed.kind !== "manual_message") {
      throw new Error("Expected manual_message");
    }

    const db = new FakeDb();
    const result = await handleManualIngest(parsed, db, { reviewChatId: "review-chat-local" });

    expect(result.status).toBe("created");
    expect(result.lifecycleStatus).toBe("queued_for_ai");
    expect(result.costControl.entersAiQueue).toBe(true);
    expect(result.itemId).toMatch(/^item_/);
    expect(result.reviewChatId).toBe("review-chat-local");
    expect(result.reviewDraft?.text).toContain("Manual item");
    expect(result.reviewDraft?.reply_markup.inline_keyboard.flat().map((button) => button.text)).toContain("Send");
    expect(db.insertedRows.some((row) => row.query.includes("INSERT OR IGNORE INTO sources"))).toBe(true);
    expect(db.insertedRows.some((row) => row.query.includes("INSERT INTO items"))).toBe(true);
    expect(db.insertedRows.some((row) => row.query.includes("INSERT OR REPLACE INTO review_messages"))).toBe(true);
  });

  it("reuses an existing item when the same URL arrives from a different Telegram message", async () => {
    const firstParsed = parseTelegramUpdate({
      update_id: 101,
      message: {
        message_id: 201,
        from: { id: 301, first_name: "Reviewer" },
        chat: { id: 401, type: "private" },
        text: "First review https://source.local/reused-post"
      }
    });

    const secondParsed = parseTelegramUpdate({
      update_id: 102,
      message: {
        message_id: 202,
        from: { id: 301, first_name: "Reviewer" },
        chat: { id: 401, type: "private" },
        text: "Second review https://source.local/reused-post"
      }
    });

    if (firstParsed.kind !== "manual_message" || secondParsed.kind !== "manual_message") {
      throw new Error("Expected manual_message updates");
    }

    const db = new FakeDb();
    const firstResult = await handleManualIngest(firstParsed, db, { reviewChatId: "review-chat-local" });
    const secondResult = await handleManualIngest(secondParsed, db, { reviewChatId: "review-chat-local" });

    expect(firstResult.status).toBe("created");
    expect(secondResult.status).toBe("duplicate");
    expect(secondResult.lifecycleStatus).toBe("duplicate_skipped");
    expect(secondResult.costControl.entersAiQueue).toBe(false);
    expect(secondResult.costControl.entersReviewQueue).toBe(false);
    expect(secondResult.itemId).toBe(firstResult.itemId);
    expect(db.insertedRows.filter((row) => row.query.includes("INSERT INTO items"))).toHaveLength(1);
    expect(db.insertedRows.filter((row) => row.query.includes("INSERT OR REPLACE INTO review_messages"))).toHaveLength(1);
  });

  it("reuses an existing text-only item by normalized text hash", async () => {
    const firstParsed = parseTelegramUpdate({
      update_id: 111,
      message: {
        message_id: 211,
        from: { id: 311, first_name: "Reviewer" },
        chat: { id: 411, type: "private" },
        text: "Manual text only item"
      }
    });

    const secondParsed = parseTelegramUpdate({
      update_id: 112,
      message: {
        message_id: 212,
        from: { id: 311, first_name: "Reviewer" },
        chat: { id: 411, type: "private" },
        text: " manual   text ONLY item "
      }
    });

    if (firstParsed.kind !== "manual_message" || secondParsed.kind !== "manual_message") {
      throw new Error("Expected manual_message updates");
    }

    const db = new FakeDb();
    const firstResult = await handleManualIngest(firstParsed, db, { reviewChatId: "review-chat-local" });
    const secondResult = await handleManualIngest(secondParsed, db, { reviewChatId: "review-chat-local" });

    expect(firstResult.status).toBe("created");
    expect(secondResult.status).toBe("duplicate");
    expect(secondResult.lifecycleStatus).toBe("duplicate_skipped");
    expect(secondResult.itemId).toBe(firstResult.itemId);
    expect(db.insertedRows.filter((row) => row.query.includes("INSERT INTO items"))).toHaveLength(1);
  });

  it("does not create review metadata for duplicate input", async () => {
    const firstParsed = parseTelegramUpdate({
      message: {
        message_id: 310,
        from: { id: 320, first_name: "Reviewer" },
        chat: { id: 330, type: "private" },
        text: "Review once https://source.local/duplicate-review"
      }
    });

    const secondParsed = parseTelegramUpdate({
      message: {
        message_id: 311,
        from: { id: 320, first_name: "Reviewer" },
        chat: { id: 330, type: "private" },
        text: "Review twice https://source.local/duplicate-review"
      }
    });

    if (firstParsed.kind !== "manual_message" || secondParsed.kind !== "manual_message") {
      throw new Error("Expected manual_message updates");
    }

    const db = new FakeDb();
    await handleManualIngest(firstParsed, db, { reviewChatId: "review-chat-local" });
    await handleManualIngest(secondParsed, db, { reviewChatId: "review-chat-local" });

    expect(db.insertedRows.filter((row) => row.query.includes("INSERT OR REPLACE INTO review_messages"))).toHaveLength(1);
  });
});
`
);

setFile(
  "README.md",
  String.raw`
# AI Curation Publisher Agent

Incremental, provider-agnostic social content curator for Telegram and WordPress.

The MVP ingests public social posts, normalizes them, deduplicates them before any expensive processing, validates them, generates platform-specific AI outputs, sends items to a private Telegram review channel, and publishes approved content to Telegram and then WordPress.

This repository is designed to be built phase by phase. Do not ask a coding agent to build the entire product in one pass.

## Current phase

This branch implements **Phase 3: Dedupe + Validation + Lifecycle Engine**.

Already included from Phase 2:

- real Telegram webhook parsing for message and callback updates
- manual text input ingestion
- manual URL input ingestion
- manual item creation in D1 using mocked processing
- basic duplicate detection by Telegram source message ID
- manual review message draft formatting
- inline review buttons for Edit, Send, Cancel, and Status
- callback routing stubs for edit, send, cancel, and status
- review message metadata storage
- review action logging
- tests for parsing, manual item creation, and callback routing

Added in Phase 3:

- dedupe key generation for platform/source post IDs, canonical URLs, normalized text, media URLs, and fallback composite keys
- dedupe repository and service functions
- raw validation for canonical URL, source identity, content availability, platform, and source type
- lifecycle transition guard support for ` + "`" + `discovered` + "`" + `, ` + "`" + `normalized` + "`" + `, ` + "`" + `duplicate_skipped` + "`" + `, ` + "`" + `invalid` + "`" + `, ` + "`" + `validated` + "`" + `, and ` + "`" + `queued_for_ai` + "`" + `
- cost-control guards so duplicates and invalid items do not enter AI, media, or review work
- manual ingest integration with the dedupe/validation/lifecycle gate
- tests for dedupe, validation, lifecycle transitions, and manual ingest duplicate behavior

Still not included:

- real Instagram provider calls
- real X/Twitter provider calls
- real AI provider calls
- real WordPress publishing
- real final Telegram publishing
- real provider polling
- media download or processing
- scheduler or cron behavior
- production scheduling logic beyond stubs

## Repository structure

` + "```text" + `
apps/
  worker-api/
    src/
      index.ts
      routes/
      handlers/
      queues/
      scheduled/
packages/
  core/
  db/
  providers/
  ai/
  telegram/
  wordpress/
  media/
  scheduler/
  observability/
.github/workflows/
` + "```" + `

## Requirements

- Node.js 22+
- pnpm 9+
- Cloudflare Wrangler, installed through dev dependencies

Enable pnpm through Corepack if it is not installed globally:

` + "```bash" + `
corepack enable
corepack prepare pnpm@9.15.4 --activate
` + "```" + `

## Install

` + "```bash" + `
pnpm install
` + "```" + `

## Lint

` + "```bash" + `
pnpm lint
` + "```" + `

The current lint script performs lightweight repository hygiene checks. A full linting setup can be added later when coding conventions stabilize.

## Typecheck

` + "```bash" + `
pnpm typecheck
` + "```" + `

## Test

` + "```bash" + `
pnpm test
` + "```" + `

Phase 3 tests cover Telegram webhook parsing, manual item creation, review callback routing, dedupe key generation, validation, lifecycle transitions, and cost-control gates.

## Run the Worker locally

Copy the example environment file:

` + "```bash" + `
cp .env.example .dev.vars
` + "```" + `

Set local-only values in ` + "`" + `.dev.vars` + "`" + `. Do not commit that file. At minimum, configure the review chat and allowed reviewer IDs with your own local Telegram IDs.

Apply local D1 migrations:

` + "```bash" + `
pnpm db:migrate:local
` + "```" + `

Start the Worker:

` + "```bash" + `
pnpm worker:dev
` + "```" + `

Available local routes:

` + "```text" + `
GET  /health
POST /telegram/webhook
` + "```" + `

## Test Telegram webhook with local mocks

After starting the Worker, send a manual text update. Replace the angle-bracket values with local test values before running the command. The reviewer ID must also be present in ` + "`" + `TELEGRAM_ALLOWED_REVIEWER_IDS` + "`" + ` inside ` + "`" + `.dev.vars` + "`" + `.

` + "```bash" + `
curl -X POST http://localhost:8787/telegram/webhook \
  -H 'content-type: application/json' \
  -d '{"update_id":<update_id>,"message":{"message_id":<message_id>,"from":{"id":<reviewer_id>,"first_name":"Local"},"chat":{"id":<chat_id>,"type":"private"},"text":"Manual post for review https://source.local/post"}}'
` + "```" + `

Expected behavior:

- the update is parsed as ` + "`" + `manual_message` + "`" + `
- the sender is checked against ` + "`" + `TELEGRAM_ALLOWED_REVIEWER_IDS` + "`" + `
- a manual source row is ensured
- dedupe keys are generated
- invalid or duplicate input is blocked before costly work
- a valid new item moves to ` + "`" + `queued_for_ai` + "`" + `
- Phase 3 still does not call real AI or media processing

Send a callback mock. Use the item ID returned by the manual-ingest response.

` + "```bash" + `
curl -X POST http://localhost:8787/telegram/webhook \
  -H 'content-type: application/json' \
  -d '{"update_id":<update_id>,"callback_query":{"id":"callback-local","from":{"id":<reviewer_id>,"first_name":"Local"},"message":{"message_id":<message_id>,"chat":{"id":<chat_id>,"type":"private"}},"data":"review:status:<item_id>"}}'
` + "```" + `

Expected behavior:

- the update is parsed as ` + "`" + `callback` + "`" + `
- the callback action is logged in ` + "`" + `review_actions` + "`" + `
- ` + "`" + `status` + "`" + ` and ` + "`" + `edit` + "`" + ` remain stubs
- ` + "`" + `send` + "`" + ` marks the item as approved but does not publish
- ` + "`" + `cancel` + "`" + ` marks the item as cancelled

## Phase 3 dedupe and lifecycle behavior

Manual ingest now runs through a pre-cost gate:

` + "```text" + `
normalize manual input
  -> generate dedupe keys
  -> validate raw item shape
  -> skip duplicates before AI/media/review work
  -> mark invalid input as invalid
  -> move valid new items discovered -> normalized -> validated -> queued_for_ai
` + "```" + `

Duplicates and invalid items do not create review metadata and do not enter AI, media, or publishing work. Valid items are queued for the future AI phase; real AI execution is still intentionally out of scope.

## D1 migrations

The initial D1 schema lives in:

` + "```text" + `
packages/db/migrations/0001_initial_schema.sql
` + "```" + `

It creates the MVP state tables described in ` + "`" + `docs/BLUEPRINT.md` + "`" + `: sources, items, dedupe keys, media assets, prompts, outputs, review messages, publish queue, WordPress posts, provider logs, review actions, and settings.

## Agent workflow

Start every coding session with:

` + "```text" + `
prompts/START_HERE_PROMPT.md
` + "```" + `

Then move one phase at a time:

` + "```text" + `
prompts/PHASE_01_PROMPT.md
prompts/PHASE_02_PROMPT.md
...
` + "```" + `

Never prompt an agent to build the full project at once.

## Phase 4 next

Phase 4 should implement the AI pipeline without adding real publishing or media processing:

- generic AI provider interface
- mock AI provider for tests
- prompt renderer
- Telegram output schema validation
- outputs table integration and token/cost logging
`
);

for (const [relativePath, content] of files.entries()) {
  const absolutePath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content, "utf8");
}

console.log("Phase 3 files written:");
for (const relativePath of files.keys()) {
  console.log(`- ${relativePath}`);
}