import { describe, expect, it } from "vitest";
import type { Source } from "@curator/core";
import { ApifyInstagramProvider } from "./apify/apify-instagram-provider";
import { FirecrawlWebProvider } from "./firecrawl/firecrawl-web-provider";
import { GetXapiXProvider } from "./getxapi/getxapi-x-provider";
import { MockProviderHttpClient } from "./http/mock-provider-http-client";
import { createProviderAvailability, ProviderUnavailableError } from "./provider-status";

function makeSource(overrides: Partial<Source> = {}): Source {
  return {
    id: "source_local",
    platform: "instagram",
    sourceType: "profile",
    value: "openai",
    providerPriority: [],
    status: "active",
    watermark: {},
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides
  };
}

describe("real provider stubs", () => {
  it("disabled Apify provider fails safely without external calls", async () => {
    const httpClient = new MockProviderHttpClient();
    const provider = new ApifyInstagramProvider({
      availability: createProviderAvailability({
        providerId: "apify_instagram",
        platform: "instagram",
        enabled: false,
        credentialConfigured: false,
        missingCredentialName: "APIFY_TOKEN"
      }),
      httpClient
    });

    await expect(provider.fetchRecentPosts(makeSource())).rejects.toMatchObject({
      name: "ProviderUnavailableError",
      providerId: "apify_instagram",
      status: "disabled"
    });
    expect(httpClient.requests).toEqual([]);
  });

  it("missing credentials fail safely without external calls", async () => {
    const httpClient = new MockProviderHttpClient();
    const provider = new GetXapiXProvider({
      availability: createProviderAvailability({
        providerId: "getxapi",
        platform: "x",
        enabled: true,
        credentialConfigured: false,
        missingCredentialName: "GETXAPI_KEY"
      }),
      httpClient
    });

    await expect(provider.fetchRecentPosts(makeSource({ platform: "x", sourceType: "query" }))).rejects.toMatchObject({
      name: "ProviderUnavailableError",
      providerId: "getxapi",
      status: "missing_credentials"
    });
    expect(httpClient.requests).toEqual([]);
  });

  it("configured stubs report health but do not implement real fetching", async () => {
    const httpClient = new MockProviderHttpClient();
    const provider = new FirecrawlWebProvider({
      availability: createProviderAvailability({
        providerId: "firecrawl",
        platform: "web",
        enabled: true,
        credentialConfigured: true,
        missingCredentialName: "FIRECRAWL_API_KEY"
      }),
      httpClient
    });

    const health = await provider.healthCheck();
    expect(health.ok).toBe(true);
    expect(health.providerId).toBe("firecrawl");

    await expect(provider.fetchByDirectUrl("https://source.local/article")).rejects.toBeInstanceOf(ProviderUnavailableError);
    await expect(provider.fetchByDirectUrl("https://source.local/article")).rejects.toMatchObject({ status: "misconfigured" });
    expect(httpClient.requests).toEqual([]);
  });
});
