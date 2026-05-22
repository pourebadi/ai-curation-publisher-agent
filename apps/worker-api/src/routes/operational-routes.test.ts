import { describe, expect, it } from "vitest";
import worker from "../index";
import { runScheduledPoll } from "../scheduled/poller";
import type { D1DatabaseLike, D1PreparedStatementLike, D1Result, D1RunResult, D1Value } from "@curator/db";
import type { Env } from "../types";

class FakeStatement implements D1PreparedStatementLike {
  private values: D1Value[] = [];

  constructor(private readonly db: FakeDb, private readonly query: string) {}

  bind(...values: D1Value[]): D1PreparedStatementLike {
    this.values = values;
    return this;
  }

  async first<T = unknown>(): Promise<T | null> {
    if (this.query.includes("COUNT(*) AS count")) {
      return { count: 0 } as T;
    }

    if (this.query.includes("FROM publish_queue")) {
      const target = String(this.values[0]);
      return (this.db.publishQueue.find((row) => row.target === target && (row.status === "pending" || row.status === "scheduled")) as T | undefined) ?? null;
    }

    if (this.query.includes("FROM outputs")) {
      return null;
    }

    if (this.query.includes("FROM items")) {
      const itemId = String(this.values[0]);
      return (this.db.items.get(itemId) as T | undefined) ?? null;
    }

    return null;
  }

  async all<T = unknown>(): Promise<D1Result<T>> {
    return { success: true, results: [] };
  }

  async run(): Promise<D1RunResult> {
    if (this.query.includes("UPDATE publish_queue SET status = 'published'")) {
      const finalMessageId = String(this.values[0]);
      const queueItemId = String(this.values[1]);
      const queueItem = this.db.publishQueue.find((row) => row.id === queueItemId);
      if (queueItem) {
        queueItem.status = "published";
        queueItem.final_message_id = finalMessageId;
      }
    }

    if (this.query.includes("UPDATE publish_queue SET status = 'failed'")) {
      const errorMessage = String(this.values[0]);
      const queueItemId = String(this.values[1]);
      const queueItem = this.db.publishQueue.find((row) => row.id === queueItemId);
      if (queueItem) {
        queueItem.status = "failed";
        queueItem.last_error = errorMessage;
      }
    }

    if (this.query.includes("UPDATE items SET status")) {
      const status = String(this.values[0]);
      const itemId = String(this.values[1]);
      const item = this.db.items.get(itemId);
      if (item) {
        item.status = status;
      }
    }

    return { success: true, changes: 1 };
  }
}

type PublishQueueRow = {
  id: string;
  item_id: string;
  target: string;
  status: string;
  scheduled_for: string | null;
  attempt_count: number;
  last_error: string | null;
  final_message_id: string | null;
  created_at: string;
  updated_at: string;
};

type ItemRow = {
  id: string;
  text?: string;
  status?: string;
};

class FakeDb implements D1DatabaseLike {
  readonly publishQueue: PublishQueueRow[] = [];
  readonly items = new Map<string, ItemRow>();

  prepare(query: string): D1PreparedStatementLike {
    return new FakeStatement(this, query);
  }
}

function makeEnv(db = new FakeDb(), overrides: Partial<Env> = {}): Env {
  return {
    DB: db as unknown as D1Database,
    ENVIRONMENT: "test",
    LOG_LEVEL: "debug",
    TELEGRAM_REVIEW_CHAT_ID: "review-chat",
    TELEGRAM_FINAL_CHAT_ID: "final-chat",
    ...overrides
  };
}

async function fetchWorker(request: globalThis.Request, env = makeEnv()): Promise<Response> {
  if (!worker.fetch) {
    throw new Error("Worker fetch handler is not defined");
  }

  const workerFetch = worker.fetch as unknown as (
    request: globalThis.Request,
    env: Env,
    ctx: ExecutionContext
  ) => Promise<Response>;

  return workerFetch(request, env, {} as ExecutionContext);
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("operational worker routes", () => {
  it("GET /health returns ok", async () => {
    const response = await fetchWorker(new Request("https://worker.local/health"));
    const body = await json(response);

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.service).toBe("ai-curation-publisher-agent");
    expect(body.environment).toBe("test");
    expect(typeof body.timestamp).toBe("string");
  });

  it("GET /status returns operational module status without secrets", async () => {
    const response = await fetchWorker(new Request("https://worker.local/status"), makeEnv(new FakeDb(), {
      PROVIDERS_MODE: "mixed",
      ENABLE_APIFY_PROVIDER: "true",
      APIFY_TOKEN: "configured"
    }));
    const body = await json(response);

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.mockMode).toBe(true);
    expect(body.modules).toMatchObject({
      telegram: true,
      ai: true,
      db: true,
      providers: true,
      media: true,
      wordpress: true,
      publishing: true
    });
    expect(body.providers).toMatchObject({
      providersMode: "mixed",
      enabledProviderIds: ["apify_instagram"],
      disabledProviderIds: ["getxapi", "firecrawl"],
      missingCredentialProviderIds: []
    });
    expect(JSON.stringify(body)).not.toContain("review-chat");
    expect(JSON.stringify(body)).not.toContain("final-chat");
    expect(JSON.stringify(body)).not.toContain("configured");
  });

  it("POST /internal/poll with a mock source returns poll metadata", async () => {
    const response = await fetchWorker(new Request("https://worker.local/internal/poll", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sources: [
          {
            id: "source_instagram_demo",
            platform: "instagram",
            sourceType: "profile",
            value: "demo_profile",
            providerPriority: ["mock_instagram"]
          }
        ],
        options: { limit: 1 }
      })
    }));
    const body = await json(response);

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.totalSources).toBe(1);
    expect(body.successfulSources).toBe(1);
    expect(body.failedSources).toBe(0);
    expect(body.totalReturned).toBe(1);
    expect(Array.isArray(body.perSource)).toBe(true);
  });

  it("POST /internal/poll uses default mock sources", async () => {
    const response = await fetchWorker(new Request("https://worker.local/internal/poll", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    }));
    const body = await json(response);

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.totalSources).toBe(3);
    expect(body.totalReturned).toBe(3);
  });

  it("POST /internal/poll handles provider failure without crashing", async () => {
    const response = await fetchWorker(new Request("https://worker.local/internal/poll", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sources: [
          {
            id: "source_unknown_provider",
            platform: "instagram",
            sourceType: "profile",
            value: "demo_profile",
            providerPriority: ["missing_provider"]
          },
          {
            id: "source_x_demo",
            platform: "x",
            sourceType: "hashtag",
            value: "ai",
            providerPriority: ["mock_x"]
          }
        ]
      })
    }));
    const body = await json(response);

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.totalSources).toBe(2);
    expect(body.successfulSources).toBe(1);
    expect(body.failedSources).toBe(1);
    expect(body.totalErrors).toBe(1);
  });

  it("POST /internal/e2e/mock-pipeline returns full mock smoke result", async () => {
    const response = await fetchWorker(new Request("https://worker.local/internal/e2e/mock-pipeline", {
      method: "POST"
    }));
    const body = await json(response);

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.itemId).toMatch(/^item_/);
    expect(body.providerUsed).toBe("mock_instagram");
    expect(body.normalizedCount).toBe(1);
    expect(body.queuedCount).toBe(1);
    expect(body.duplicateCount).toBe(0);
    expect(body.invalidCount).toBe(0);
    expect(body.aiOutputCreated).toBe(true);
    expect(body.reviewMessageCreated).toBe(true);
    expect(body.approved).toBe(true);
    expect(body.queuedForPublish).toBe(true);
    expect(body.telegramPublished).toBe(true);
    expect(body.finalMessageId).toMatch(/^mock_telegram_final_/);
    expect(body.wordpressPrepared).toBe(true);
    expect(body.wordpressPublished).toBe(true);
    expect(body.wordpressPostId).toBe("mock_wp_post_1");
  });

  it("POST /internal/publish/telegram returns structured no-item result", async () => {
    const response = await fetchWorker(new Request("https://worker.local/internal/publish/telegram", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    }));
    const body = await json(response);

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.outcome).toBe("none");
    expect(body.reason).toBe("no_publishable_item");
  });

  it("POST /internal/publish/telegram returns structured published result", async () => {
    const db = new FakeDb();
    db.items.set("item_local", { id: "item_local", text: "Final message" });
    db.publishQueue.push({
      id: "queue_local",
      item_id: "item_local",
      target: "telegram",
      status: "pending",
      scheduled_for: null,
      attempt_count: 0,
      last_error: null,
      final_message_id: null,
      created_at: new Date(0).toISOString(),
      updated_at: new Date(0).toISOString()
    });

    const response = await fetchWorker(new Request("https://worker.local/internal/publish/telegram", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ publishNow: true })
    }), makeEnv(db));
    const body = await json(response);

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.outcome).toBe("published");
    expect(body.itemId).toBe("item_local");
    expect(body.finalMessageId).toBe("mock_telegram_final_1");
  });

  it("scheduled poll operation returns mock-safe result", async () => {
    const result = await runScheduledPoll({
      scheduledTime: 1_700_000_000_000,
      cron: "*/30 * * * *",
      env: makeEnv()
    });

    expect(result.ok).toBe(true);
    expect(result.mockMode).toBe(true);
    expect(result.scheduledTime).toBe(1_700_000_000_000);
    expect(result.cron).toBe("*/30 * * * *");
    expect(result.totalSources).toBe(3);
    expect(result.totalReturned).toBe(3);
  });

  it("returns 405 for invalid methods", async () => {
    const response = await fetchWorker(new Request("https://worker.local/internal/poll", { method: "GET" }));
    const body = await json(response);

    expect(response.status).toBe(405);
    expect(body.error).toBe("method_not_allowed");
  });

  it("returns 405 for invalid e2e method", async () => {
    const response = await fetchWorker(new Request("https://worker.local/internal/e2e/mock-pipeline", { method: "GET" }));
    const body = await json(response);

    expect(response.status).toBe(405);
    expect(body.error).toBe("method_not_allowed");
  });

  it("returns 400 for malformed JSON", async () => {
    const response = await fetchWorker(new Request("https://worker.local/internal/poll", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{"
    }));
    const body = await json(response);

    expect(response.status).toBe(400);
    expect(body.error).toBe("malformed_json");
  });
});
