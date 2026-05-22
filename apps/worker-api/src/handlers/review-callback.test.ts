import { describe, expect, it } from "vitest";
import { parseTelegramUpdate } from "@curator/telegram";
import { handleReviewCallback } from "./review-callback";
import type { D1DatabaseLike, D1PreparedStatementLike, D1RunResult, D1Result, D1Value } from "@curator/db";
import type { ParsedTelegramCallback, TelegramReviewAction } from "@curator/telegram";

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

function makeCallback(action: TelegramReviewAction): ParsedTelegramCallback {
  const parsed = parseTelegramUpdate({
    update_id: 55,
    callback_query: {
      id: `callback-${action}`,
      from: { id: 66, first_name: "Reviewer" },
      message: { message_id: 77, chat: { id: 88, type: "private" } },
      data: `review:${action}:item_local`
    }
  });

  if (parsed.kind !== "callback") {
    throw new Error("Expected callback");
  }

  return parsed;
}

describe("handleReviewCallback", () => {
  it("logs send callbacks and marks the item approved without final publishing", async () => {
    const db = new FakeDb();
    const result = await handleReviewCallback(makeCallback("send"), db);

    expect(result.action).toBe("send");
    expect(result.resultingStatus).toBe("approved");
    expect(result.statusResponse).toEqual({
      itemId: "item_local",
      action: "send",
      status: "approved",
      message: "Send action approved the item. Final publishing is not triggered in Phase 5.",
      finalPublishingTriggered: false,
      editStubbed: false
    });
    expect(db.runCalls.some((call) => call.query.includes("INSERT INTO review_actions"))).toBe(true);
    expect(db.runCalls.some((call) => call.query.includes("UPDATE items SET status"))).toBe(true);
  });

  it("logs cancel callbacks and marks the item cancelled", async () => {
    const db = new FakeDb();
    const result = await handleReviewCallback(makeCallback("cancel"), db);

    expect(result.action).toBe("cancel");
    expect(result.resultingStatus).toBe("cancelled");
    expect(result.statusResponse.status).toBe("cancelled");
    expect(result.statusResponse.finalPublishingTriggered).toBe(false);
    expect(db.runCalls.some((call) => call.query.includes("INSERT INTO review_actions"))).toBe(true);
    expect(db.runCalls.some((call) => call.query.includes("UPDATE items SET status"))).toBe(true);
  });

  it("logs status callbacks and returns structured status without changing item state", async () => {
    const db = new FakeDb();
    const result = await handleReviewCallback(makeCallback("status"), db);

    expect(result.action).toBe("status");
    expect(result.resultingStatus).toBe("sent_to_review");
    expect(result.statusResponse).toEqual({
      itemId: "item_local",
      action: "status",
      status: "sent_to_review",
      message: "Status action returned current review routing state.",
      finalPublishingTriggered: false,
      editStubbed: false
    });
    expect(db.runCalls.some((call) => call.query.includes("INSERT INTO review_actions"))).toBe(true);
    expect(db.runCalls.some((call) => call.query.includes("UPDATE items SET status"))).toBe(false);
  });

  it("logs edit callbacks as an acknowledged stub", async () => {
    const db = new FakeDb();
    const result = await handleReviewCallback(makeCallback("edit"), db);

    expect(result.action).toBe("edit");
    expect(result.resultingStatus).toBe("sent_to_review");
    expect(result.statusResponse.editStubbed).toBe(true);
    expect(result.statusResponse.finalPublishingTriggered).toBe(false);
    expect(result.statusResponse.message).toContain("stubbed");
    expect(db.runCalls.some((call) => call.query.includes("INSERT INTO review_actions"))).toBe(true);
    expect(db.runCalls.some((call) => call.query.includes("UPDATE items SET status"))).toBe(false);
  });
});
