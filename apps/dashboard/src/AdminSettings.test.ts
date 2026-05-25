import { describe, expect, it } from "vitest";
import { aiMissingNextAction, providerSetupSkippedInManualOnly, secretStatusLabel, settingsSourceLabel } from "./AdminSettings";

describe("AdminSettings helpers", () => {
  it("skips provider setup in manual-only mode", () => {
    expect(providerSetupSkippedInManualOnly("manual_only")).toBe(true);
    expect(providerSetupSkippedInManualOnly("provider_assisted")).toBe(false);
  });

  it("returns plain source labels", () => {
    expect(settingsSourceLabel("d1")).toBe("Dashboard");
    expect(settingsSourceLabel("env")).toBe("Cloudflare env");
    expect(settingsSourceLabel("default")).toBe("Default");
    expect(settingsSourceLabel("missing")).toBe("Missing");
  });

  it("returns safe secret status labels", () => {
    expect(secretStatusLabel({ isSecret: true, configured: true })).toBe("Configured");
    expect(secretStatusLabel({ isSecret: true, configured: false })).toBe("Missing");
    expect(secretStatusLabel({ isSecret: false, configured: true })).toBe("Not secret");
  });

  it("generates AI missing next action", () => {
    expect(aiMissingNextAction("openai", false)).toContain("Settings -> AI");
    expect(aiMissingNextAction("mock", false)).toBe("AI settings are usable.");
  });
});
