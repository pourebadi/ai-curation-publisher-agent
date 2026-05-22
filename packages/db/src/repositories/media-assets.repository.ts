import type { D1DatabaseLike } from "../client";

export type MediaAssetStatus = "pending" | "ready" | "failed" | "skipped";

export type MediaAssetRecord = {
  id: string;
  itemId: string;
  kind: string;
  status: MediaAssetStatus;
  sourceUrl: string;
  canonicalUrl?: string;
  mediaUrlHash?: string;
  r2Key?: string;
  publicUrl?: string;
  sizeBytes?: number;
  mimeType?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateMediaAssetInput = {
  id: string;
  itemId: string;
  kind: string;
  status?: MediaAssetStatus;
  sourceUrl: string;
  canonicalUrl?: string;
  storageKey?: string;
  publicUrl?: string;
  sizeBytes?: number;
  mimeType?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  errorMessage?: string;
};

export class MediaAssetsRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async createMany(assets: CreateMediaAssetInput[]): Promise<void> {
    for (const asset of assets) {
      await this.db.prepare(
        `INSERT OR REPLACE INTO media_assets (id, item_id, kind, status, source_url, canonical_url, media_url_hash, r2_key, public_url, size_bytes, mime_type, width, height, duration_seconds, error_message, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      ).bind(
        asset.id,
        asset.itemId,
        asset.kind,
        asset.status ?? "pending",
        asset.sourceUrl,
        asset.canonicalUrl ?? null,
        stableHash(asset.canonicalUrl ?? asset.sourceUrl),
        asset.storageKey ?? null,
        asset.publicUrl ?? null,
        asset.sizeBytes ?? null,
        asset.mimeType ?? null,
        asset.width ?? null,
        asset.height ?? null,
        asset.durationSeconds ?? null,
        asset.errorMessage ?? null
      ).run();
    }
  }

  async findByItemId(itemId: string): Promise<MediaAssetRecord[]> {
    const result = await this.db
      .prepare("SELECT * FROM media_assets WHERE item_id = ? ORDER BY created_at ASC")
      .bind(itemId)
      .all<MediaAssetRow>();

    return (result.results ?? []).map(toMediaAssetRecord);
  }

  async updateStatus(id: string, status: MediaAssetStatus, errorMessage?: string): Promise<void> {
    await this.db
      .prepare("UPDATE media_assets SET status = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(status, errorMessage ?? null, id)
      .run();
  }
}

type MediaAssetRow = {
  id: string;
  item_id: string;
  kind: string;
  status: MediaAssetStatus;
  source_url: string;
  canonical_url: string | null;
  media_url_hash: string | null;
  r2_key: string | null;
  public_url: string | null;
  size_bytes: number | null;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

function toMediaAssetRecord(row: MediaAssetRow): MediaAssetRecord {
  return {
    id: row.id,
    itemId: row.item_id,
    kind: row.kind,
    status: row.status,
    sourceUrl: row.source_url,
    ...(row.canonical_url === null ? {} : { canonicalUrl: row.canonical_url }),
    ...(row.media_url_hash === null ? {} : { mediaUrlHash: row.media_url_hash }),
    ...(row.r2_key === null ? {} : { r2Key: row.r2_key }),
    ...(row.public_url === null ? {} : { publicUrl: row.public_url }),
    ...(row.size_bytes === null ? {} : { sizeBytes: row.size_bytes }),
    ...(row.mime_type === null ? {} : { mimeType: row.mime_type }),
    ...(row.width === null ? {} : { width: row.width }),
    ...(row.height === null ? {} : { height: row.height }),
    ...(row.duration_seconds === null ? {} : { durationSeconds: row.duration_seconds }),
    ...(row.error_message === null ? {} : { errorMessage: row.error_message }),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function stableHash(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}
