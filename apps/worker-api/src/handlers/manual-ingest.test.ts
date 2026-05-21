import { describe, expect, it } from "vitest";
import { parseTelegramUpdate } from "@curator/telegram";
import { handleManualIngest } from "./manual-ingest";
import type { D1DatabaseLike, D1PreparedStatementLike, D1RunResult, D1Result, D1Value } from "@curator/db";

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
    if (this.query.includes("FROM items WHERE source_post_id")) {
      return null;
    }

    return null;
  }

  async all<T = unknown>(): Promise<D1Result<T>> {
    return { success: true, results: [] };
  }

  async run(): Promise<D1RunResult> {
    this.db.insertedRows.push({ query: this.query, values: this.values });
    return { success: true, changes: 1 };
  }
}

class FakeDb implements D1DatabaseLike {
  insertedRows: InsertedRow[] = [];

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
});
