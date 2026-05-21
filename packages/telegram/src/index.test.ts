import { describe, expect, it } from "vitest";
import {
  buildReviewInlineKeyboard,
  buildTelegramReviewDraft,
  parseAllowedReviewerIds,
  parseReviewCallbackData,
  parseTelegramUpdate
} from "./index";

describe("telegram manual ingest parsing", () => {
  it("parses manual text input with a URL", () => {
    const parsed = parseTelegramUpdate({
      update_id: 1,
      message: {
        message_id: 2,
        from: { id: 3, first_name: "Reviewer" },
        chat: { id: 4, type: "private" },
        text: "Please review https://source.local/post for the channel"
      }
    });

    expect(parsed.kind).toBe("manual_message");
    if (parsed.kind !== "manual_message") {
      throw new Error("Expected manual_message");
    }

    expect(parsed.text).toContain("Please review");
    expect(parsed.urls).toEqual(["https://source.local/post"]);
    expect(parsed.reviewerId).toBe("3");
  });

  it("parses review callback routing data", () => {
    const parsed = parseTelegramUpdate({
      callback_query: {
        id: "callback-local",
        from: { id: 5, first_name: "Reviewer" },
        message: { message_id: 6, chat: { id: 7, type: "private" } },
        data: "review:send:item_local"
      }
    });

    expect(parsed.kind).toBe("callback");
    if (parsed.kind !== "callback") {
      throw new Error("Expected callback");
    }

    expect(parsed.action).toBe("send");
    expect(parsed.itemId).toBe("item_local");
    expect(parsed.reviewerId).toBe("5");
  });

  it("rejects unsupported callback data", () => {
    expect(parseReviewCallbackData("unknown:send:item_local")).toBeNull();
    expect(parseReviewCallbackData("review:publish:item_local")).toBeNull();
  });

  it("builds the Phase 2 review keyboard", () => {
    const keyboard = buildReviewInlineKeyboard("item_local");

    expect(keyboard.inline_keyboard.flat().map((button) => button.text)).toEqual([
      "Edit",
      "Send",
      "Cancel",
      "Status"
    ]);
  });

  it("builds a review draft with caption, source, and status", () => {
    const draft = buildTelegramReviewDraft({
      itemId: "item_local",
      caption: "Manual caption",
      sourceUrl: "https://source.local/post",
      status: "sent_to_review",
      links: ["https://source.local/post"]
    });

    expect(draft.text).toContain("Manual review draft");
    expect(draft.text).toContain("Manual caption");
    expect(draft.text).toContain("sent_to_review");
    expect(draft.reply_markup.inline_keyboard).toHaveLength(2);
  });

  it("parses comma-separated reviewer allowlists", () => {
    expect(Array.from(parseAllowedReviewerIds("alpha, beta, gamma"))).toEqual(["alpha", "beta", "gamma"]);
  });
});
