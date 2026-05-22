import { describe, expect, it } from "vitest";
import { providerAvailabilityList, readProviderRuntimeConfig, summarizeProviderConfig } from "./provider-config";

describe("provider runtime config", () => {
  it("uses mock mode by default", () => {
    const config = readProviderRuntimeConfig({});

    expect(config.mode).toBe("mock");
    expect(config.mockProvidersEnabled).toBe(true);
    expect(config.realProviders.apifyInstagram.enabled).toBe(false);
    expect(config.realProviders.getxapiX.enabled).toBe(false);
    expect(config.realProviders.firecrawlWeb.enabled).toBe(false);
  });

  it("keeps real provider stubs disabled by default even when keys exist", () => {
    const config = readProviderRuntimeConfig({
      APIFY_TOKEN: "in-memory-token",
      GETXAPI_KEY: "in-memory-key",
      FIRECRAWL_API_KEY: "in-memory-key"
    });

    expect(config.mode).toBe("mock");
    expect(providerAvailabilityList(config).every((entry) => entry.status === "disabled")).toBe(true);
  });

  it("reports missing credentials without crashing", () => {
    const config = readProviderRuntimeConfig({
      PROVIDERS_MODE: "mixed",
      ENABLE_APIFY_PROVIDER: "true"
    });
    const availability = providerAvailabilityList(config);

    expect(availability.find((entry) => entry.providerId === "apify_instagram")?.status).toBe("missing_credentials");
    expect(availability.find((entry) => entry.providerId === "apify_instagram")?.enabled).toBe(false);
  });

  it("reports enabled when a flag and in-memory credential are present", () => {
    const config = readProviderRuntimeConfig({
      PROVIDERS_MODE: "mixed",
      ENABLE_FIRECRAWL_PROVIDER: "true",
      FIRECRAWL_API_KEY: "in-memory-key"
    });
    const availability = providerAvailabilityList(config);

    expect(availability.find((entry) => entry.providerId === "firecrawl")?.status).toBe("enabled");
    expect(availability.find((entry) => entry.providerId === "firecrawl")?.credentialConfigured).toBe(true);
  });

  it("summarizes provider config without exposing secret values", () => {
    const config = readProviderRuntimeConfig({
      PROVIDERS_MODE: "mixed",
      ENABLE_GETXAPI_PROVIDER: "true",
      GETXAPI_KEY: "super-sensitive-value"
    });
    const summary = summarizeProviderConfig(config);

    expect(summary.providersMode).toBe("mixed");
    expect(summary.enabledProviderIds).toEqual(["getxapi"]);
    expect(JSON.stringify(summary)).not.toContain("super-sensitive-value");
  });
});
