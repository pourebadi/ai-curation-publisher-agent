import { describe, expect, it } from "vitest";
import { parseTelegramUpdate } from "@curator/telegram";
import { handleReviewCallback } from "./review-callback";
import type { D1DatabaseLike, D1PreparedStatementLike, D1RunResult, D1Result, D1Value } from "@curator/db";

type RunCall = {
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
    return null;
  }

  async all<T = unknown>(): Promise<D1Result<T>> {
    return { success: true, results: [] };
  }

  async run(): Promise<D1RunResult> {
    this.db.runCalls.push({ query: this.query, values: this.values });
    return { success: true, changes: 1 };
  }
}

class FakeDb implements D1DatabaseLike {
  runCalls: RunCall[] = [];

  prepare(query: string): D1PreparedStatementLike {
    return new FakeStatement(this, query);
  }
}

describe("handleReviewCallback", () => {
  it("logs callback actions and marks send as approved", async () => {
    const parsed = parseTelegramUpdate({
      update_id: 55,
      callback_query: {
        id: "callback-local",
        from: { id: 66, first_name: "Reviewer" },
        message: { message_id: 77, chat: { id: 88, type: "private" } },
        data: "review:send:item_local"
      }
    });

    if (parsed.kind !== "callback") {
      throw new Error("Expected callback");
    }

    const db = new FakeDb();
    const result = await handleReviewCallback(parsed, db);

    expect(result.action).toBe("send");
    expect(result.resultingStatus).toBe("approved");
    expect(db.runCalls.some((call) => call.query.includes("INSERT INTO review_actions"))).toBe(true);
    expect(db.runCalls.some((call) => call.query.includes("UPDATE items SET status"))).toBe(true);
  });

  it("logs status callbacks without changing item state", async () => {
    const parsed = parseTelegramUpdate({
      callback_query: {
        id: "callback-local",
        from: { id: 99, first_name: "Reviewer" },
        data: "review:status:item_local"
      }
    });

    if (parsed.kind !== "callback") {
      throw new Error("Expected callback");
    }

    const db = new FakeDb();
    const result = await handleReviewCallback(parsed, db);

    expect(result.action).toBe("status");
    expect(result.resultingStatus).toBe("sent_to_review");
    expect(db.runCalls.some((call) => call.query.includes("INSERT INTO review_actions"))).toBe(true);
    expect(db.runCalls.some((call) => call.query.includes("UPDATE items SET status"))).toBe(false);
  });
});
