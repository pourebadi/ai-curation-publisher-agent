import { describe, expect, it } from "vitest";
import { canTransitionItemStatus, isItemStatus, isTerminalItemStatus } from "./lifecycle";

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
});
