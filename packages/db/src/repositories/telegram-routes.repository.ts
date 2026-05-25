import type { D1DatabaseLike } from "../client";

export type TelegramRouteRecord = {
  id: string;
  category: string;
  sourceChatId: string;
  sourceThreadId: number;
  promptProfile: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TelegramRouteOutputRecord = {
  id: string;
  routeId: string;
  language: string;
  reviewChatId: string;
  reviewThreadId: number;
  finalChatId: string;
  finalThreadId?: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TelegramRouteWithOutputs = {
  route: TelegramRouteRecord;
  outputs: TelegramRouteOutputRecord[];
};

export type UpsertTelegramRouteInput = {
  id: string;
  category: string;
  sourceChatId: string;
  sourceThreadId: number;
  promptProfile: string;
  enabled?: boolean;
};

export type UpsertTelegramRouteOutputInput = {
  id: string;
  routeId: string;
  language: string;
  reviewChatId: string;
  reviewThreadId: number;
  finalChatId: string;
  finalThreadId?: number;
  enabled?: boolean;
};

type TelegramRouteRow = {
  id: string;
  category: string;
  source_chat_id: string;
  source_thread_id: number;
  prompt_profile: string;
  enabled: number;
  created_at: string;
  updated_at: string;
};

type TelegramRouteOutputRow = {
  id: string;
  route_id: string;
  language: string;
  review_chat_id: string;
  review_thread_id: number;
  final_chat_id: string;
  final_thread_id: number | null;
  enabled: number;
  created_at: string;
  updated_at: string;
};

export class TelegramRoutesRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async findEnabledRouteForSource(sourceChatId: string, sourceThreadId: number): Promise<TelegramRouteWithOutputs | null> {
    const routeRow = await this.db
      .prepare("SELECT * FROM telegram_routes WHERE source_chat_id = ? AND source_thread_id = ? AND enabled = 1 LIMIT 1")
      .bind(sourceChatId, sourceThreadId)
      .first<TelegramRouteRow>();

    if (!routeRow) {
      return null;
    }

    const outputRows = await this.db
      .prepare("SELECT * FROM telegram_route_outputs WHERE route_id = ? AND enabled = 1 ORDER BY language ASC, id ASC")
      .bind(routeRow.id)
      .all<TelegramRouteOutputRow>();

    return {
      route: toRouteRecord(routeRow),
      outputs: (outputRows.results ?? []).map(toRouteOutputRecord)
    };
  }

  async listRoutes(): Promise<TelegramRouteRecord[]> {
    const result = await this.db.prepare("SELECT * FROM telegram_routes ORDER BY category ASC, id ASC").all<TelegramRouteRow>();
    return (result.results ?? []).map(toRouteRecord);
  }

  async listOutputs(): Promise<TelegramRouteOutputRecord[]> {
    const result = await this.db.prepare("SELECT * FROM telegram_route_outputs ORDER BY route_id ASC, language ASC, id ASC").all<TelegramRouteOutputRow>();
    return (result.results ?? []).map(toRouteOutputRecord);
  }

  async countSummary(): Promise<{ routeCount: number; enabledRouteCount: number; outputCount: number; enabledOutputCount: number; reviewRoutingConfigured: boolean }> {
    const routeCount = await this.count("telegram_routes", "1 = 1");
    const enabledRouteCount = await this.count("telegram_routes", "enabled = 1");
    const outputCount = await this.count("telegram_route_outputs", "1 = 1");
    const enabledOutputCount = await this.count("telegram_route_outputs", "enabled = 1");
    const reviewRoutingConfigured = enabledRouteCount > 0 && enabledOutputCount > 0;
    return { routeCount, enabledRouteCount, outputCount, enabledOutputCount, reviewRoutingConfigured };
  }

  async upsertRoute(input: UpsertTelegramRouteInput): Promise<TelegramRouteRecord> {
    const now = new Date().toISOString();
    await this.db.prepare(
      `INSERT INTO telegram_routes (id, category, source_chat_id, source_thread_id, prompt_profile, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET category = excluded.category, source_chat_id = excluded.source_chat_id, source_thread_id = excluded.source_thread_id, prompt_profile = excluded.prompt_profile, enabled = excluded.enabled, updated_at = excluded.updated_at`
    ).bind(input.id, input.category, input.sourceChatId, input.sourceThreadId, input.promptProfile, input.enabled === false ? 0 : 1, now, now).run();

    return {
      id: input.id,
      category: input.category,
      sourceChatId: input.sourceChatId,
      sourceThreadId: input.sourceThreadId,
      promptProfile: input.promptProfile,
      enabled: input.enabled !== false,
      createdAt: now,
      updatedAt: now
    };
  }

  async upsertRouteOutput(input: UpsertTelegramRouteOutputInput): Promise<TelegramRouteOutputRecord> {
    const now = new Date().toISOString();
    await this.db.prepare(
      `INSERT INTO telegram_route_outputs (id, route_id, language, review_chat_id, review_thread_id, final_chat_id, final_thread_id, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET language = excluded.language, review_chat_id = excluded.review_chat_id, review_thread_id = excluded.review_thread_id, final_chat_id = excluded.final_chat_id, final_thread_id = excluded.final_thread_id, enabled = excluded.enabled, updated_at = excluded.updated_at`
    ).bind(input.id, input.routeId, input.language, input.reviewChatId, input.reviewThreadId, input.finalChatId, input.finalThreadId ?? null, input.enabled === false ? 0 : 1, now, now).run();

    return {
      id: input.id,
      routeId: input.routeId,
      language: input.language,
      reviewChatId: input.reviewChatId,
      reviewThreadId: input.reviewThreadId,
      finalChatId: input.finalChatId,
      ...(input.finalThreadId === undefined ? {} : { finalThreadId: input.finalThreadId }),
      enabled: input.enabled !== false,
      createdAt: now,
      updatedAt: now
    };
  }

  private async count(tableName: "telegram_routes" | "telegram_route_outputs", whereClause: string): Promise<number> {
    try {
      const row = await this.db.prepare(`SELECT COUNT(*) AS count FROM ${tableName} WHERE ${whereClause}`).first<{ count: number }>();
      return row?.count ?? 0;
    } catch {
      return 0;
    }
  }
}

function toRouteRecord(row: TelegramRouteRow): TelegramRouteRecord {
  return {
    id: row.id,
    category: row.category,
    sourceChatId: row.source_chat_id,
    sourceThreadId: row.source_thread_id,
    promptProfile: row.prompt_profile,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toRouteOutputRecord(row: TelegramRouteOutputRow): TelegramRouteOutputRecord {
  return {
    id: row.id,
    routeId: row.route_id,
    language: row.language,
    reviewChatId: row.review_chat_id,
    reviewThreadId: row.review_thread_id,
    finalChatId: row.final_chat_id,
    ...(row.final_thread_id === null ? {} : { finalThreadId: row.final_thread_id }),
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
