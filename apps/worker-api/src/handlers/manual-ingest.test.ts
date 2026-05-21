import { describe, expect, it } from "vitest";
import { parseTelegramUpdate } from "@curator/telegram";
import { handleManualIngest } from "./manual-ingest";
import type { D1DatabaseLike, D1PreparedStatementLike, D1RunResult, D1Result, D1Value } from "@curator/db";
import type { Item } from "@curator/core";

type InsertedRow = {
  query: string;
  values: D1Value[];
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

    return { success: true, changes: 1 };
  }
}

class FakeDb implements D1DatabaseLike {
  insertedRows: InsertedRow[] = [];
  items: Item[] = [];

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
    expect(result.itemId).toMatch(/^item_/);
    expect(result.reviewChatId).toBe("review-chat-local");
    expect(result.reviewDraft.text).toContain("Manual item");
    expect(result.reviewDraft.reply_markup.inline_keyboard.flat().map((button) => button.text)).toContain("Send");
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
    expect(secondResult.itemId).toBe(firstResult.itemId);
    expect(db.insertedRows.filter((row) => row.query.includes("INSERT INTO items"))).toHaveLength(1);
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
    expect(secondResult.itemId).toBe(firstResult.itemId);
    expect(db.insertedRows.filter((row) => row.query.includes("INSERT INTO items"))).toHaveLength(1);
  });
});
