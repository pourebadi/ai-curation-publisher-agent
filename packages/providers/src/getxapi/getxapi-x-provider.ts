import type { Platform, Source, SourceType } from "@curator/core";
import type { ProviderAdapter, ProviderFetchOptions, ProviderFetchResponse, ProviderHealthStatus } from "../provider-adapter";
import { assertProviderAvailable, ProviderUnavailableError, type ProviderAvailability } from "../provider-status";
import type { ProviderHttpClient } from "../http/provider-http-client";

export type GetXapiXProviderOptions = {
  availability: ProviderAvailability;
  httpClient?: ProviderHttpClient;
  now?: () => Date;
};

export class GetXapiXProvider implements ProviderAdapter {
  readonly id = "getxapi";
  readonly name = "GetXAPI X Provider Stub";
  readonly platform: Platform = "x";
  readonly supportedSourceTypes = ["profile", "hashtag", "query", "direct_url"] as const satisfies readonly SourceType[];

  private readonly availability: ProviderAvailability;
  private readonly httpClient: ProviderHttpClient | undefined;
  private readonly now: () => Date;

  constructor(options: GetXapiXProviderOptions) {
    this.availability = options.availability;
    this.httpClient = options.httpClient;
    this.now = options.now ?? (() => new Date(0));
  }

  async healthCheck(): Promise<ProviderHealthStatus> {
    return {
      providerId: this.id,
      platform: this.platform,
      ok: this.availability.enabled,
      checkedAt: this.now().toISOString(),
      message: this.availability.message
    };
  }

  async fetchRecentPosts(_source: Source, _options: ProviderFetchOptions = {}): Promise<ProviderFetchResponse> {
    assertProviderAvailable(this.availability);
    return this.notImplemented();
  }

  async fetchByDirectUrl(_url: string, _options: ProviderFetchOptions = {}): Promise<ProviderFetchResponse> {
    assertProviderAvailable(this.availability);
    return this.notImplemented();
  }

  private notImplemented(): never {
    void this.httpClient;
    throw new ProviderUnavailableError(
      this.id,
      "misconfigured",
      "GetXAPI provider is configured but real HTTP fetching is intentionally not implemented in Phase 13."
    );
  }
}
