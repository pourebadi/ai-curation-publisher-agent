import { describe, expect, it } from "vitest";
import { buildManagerSetupSummary, deriveSchedulerSafety, deriveSetupCenter, redactSensitiveJson } from "./setup";
import type { StatusBundle } from "./types";

function ok(data: Record<string, unknown>) {
  return { ok: true as const, status: 200, data };
}

function bundle(overrides: Partial<StatusBundle> = {}): StatusBundle {
  return {
    health: ok({ ok: true }),
    status: ok({
      ok: true,
      environment: "production",
      logLevel: "info",
      mockMode: true,
      providers: {
        providersMode: "mock",
        firecrawl: { enabled: false, configured: false, status: "disabled" }
      },
      scheduler: {
        enabled: false,
        dryRun: true,
        realProvidersAllowed: false,
        publishingAllowed: false,
        maxSourcesPerRun: 1,
        maxItemsPerRun: 2
      },
      quotas: {
        maxAiItemsPerRun: 0,
        maxProviderItemsPerRun: 5,
        maxPublishItemsPerRun: 0
      },
      telegram: {
        reviewChatConfigured: false,
        finalChatConfigured: false,
        botTokenConfigured: false,
        realReviewEnabled: false
      }
    }),
    ready: ok({
      ok: true,
      ready: true,
      summary: {
        environment: "production",
        providersMode: "mock",
        hasInternalSecret: true,
        hasTelegramConfig: false,
        hasTelegramBotToken: false,
        telegramRealReviewEnabled: false,
        hasWordPressConfig: false,
        hasWordPressBaseUrl: false,
        hasWordPressCredentials: false,
        wordpressRealDryRunEnabled: false,
        wordpressDefaultStatus: "draft",
        scheduler: {
          enabled: false,
          dryRun: true,
          realProvidersAllowed: false,
          publishingAllowed: false,
          maxSourcesPerRun: 1,
          maxItemsPerRun: 2
        },
        quotas: {
          maxAiItemsPerRun: 0,
          maxProviderItemsPerRun: 5,
          maxPublishItemsPerRun: 0
        },
        hasProviderCredentials: {
          apify: false,
          getxapi: false,
          firecrawl: false
        }
      },
      warnings: [],
      errors: []
    }),
    ...overrides
  };
}

describe("dashboard setup helpers", () => {
  it("derives setup status and manager summary from Worker status", () => {
    const setup = deriveSetupCenter(bundle(), true);

    expect(setup.workerConnection.label).toBe("Worker reachable");
    expect(setup.internalSecurity.label).toBe("Internal routes protected and dashboard credential entered");
    expect(setup.launchSummary.overallStatus).toBe("Setup in progress");
    expect(buildManagerSetupSummary(bundle(), true).recommendedNextStep).toContain("Choose one optional integration");
  });

  it("marks scheduler publishing or real providers as risky", () => {
    const risky = bundle({
      ready: ok({
        ok: true,
        ready: true,
        summary: {
          hasInternalSecret: true,
          scheduler: {
            enabled: true,
            dryRun: false,
            realProvidersAllowed: true,
            publishingAllowed: true,
            maxSourcesPerRun: 5,
            maxItemsPerRun: 10
          },
          quotas: {
            maxAiItemsPerRun: 10,
            maxProviderItemsPerRun: 10,
            maxPublishItemsPerRun: 10
          }
        },
        warnings: [],
        errors: []
      })
    });

    const safety = deriveSchedulerSafety(risky);

    expect(safety.riskLabel).toBe("Risky");
    expect(safety.warnings).toEqual(expect.arrayContaining([
      "Scheduler publishing is allowed. This is risky before launch approval.",
      "Scheduler can use real providers. Keep this disabled for setup."
    ]));
  });

  it("redacts sensitive values from JSON before display or local history", () => {
    const redacted = redactSensitiveJson({
      ok: true,
      nested: {
        apiToken: "secret-value",
        password: "another-secret",
        publicStatus: "safe"
      }
    });

    expect(JSON.stringify(redacted)).not.toContain("secret-value");
    expect(JSON.stringify(redacted)).not.toContain("another-secret");
    expect(JSON.stringify(redacted)).toContain("publicStatus");
  });
});
