import type { Platform } from "@curator/core";
import { createProviderAvailability, type ProviderAvailability } from "../provider-status";

export type ProvidersMode = "mock" | "mixed" | "real";

export type ProviderRuntimeEnv = {
  PROVIDERS_MODE?: string;
  ENABLE_APIFY_PROVIDER?: string;
  ENABLE_GETXAPI_PROVIDER?: string;
  ENABLE_FIRECRAWL_PROVIDER?: string;
  APIFY_TOKEN?: string;
  GETXAPI_KEY?: string;
  FIRECRAWL_API_KEY?: string;
};

export type RealProviderConfig = {
  providerId: string;
  platform: Platform;
  enabled: boolean;
  credentialConfigured: boolean;
  credentialEnvName: "APIFY_TOKEN" | "GETXAPI_KEY" | "FIRECRAWL_API_KEY";
};

export type ProviderRuntimeConfig = {
  mode: ProvidersMode;
  mockProvidersEnabled: boolean;
  realProviders: {
    apifyInstagram: RealProviderConfig;
    getxapiX: RealProviderConfig;
    firecrawlWeb: RealProviderConfig;
  };
};

export type ProviderConfigSummary = {
  providersMode: ProvidersMode;
  enabledProviderIds: string[];
  disabledProviderIds: string[];
  missingCredentialProviderIds: string[];
};

export function readProviderRuntimeConfig(env: ProviderRuntimeEnv = {}): ProviderRuntimeConfig {
  const mode = normalizeProvidersMode(env.PROVIDERS_MODE);

  return {
    mode,
    mockProvidersEnabled: mode !== "real",
    realProviders: {
      apifyInstagram: {
        providerId: "apify_instagram",
        platform: "instagram",
        enabled: realProviderEnabled(mode, env.ENABLE_APIFY_PROVIDER),
        credentialConfigured: hasValue(env.APIFY_TOKEN),
        credentialEnvName: "APIFY_TOKEN"
      },
      getxapiX: {
        providerId: "getxapi",
        platform: "x",
        enabled: realProviderEnabled(mode, env.ENABLE_GETXAPI_PROVIDER),
        credentialConfigured: hasValue(env.GETXAPI_KEY),
        credentialEnvName: "GETXAPI_KEY"
      },
      firecrawlWeb: {
        providerId: "firecrawl",
        platform: "web",
        enabled: realProviderEnabled(mode, env.ENABLE_FIRECRAWL_PROVIDER),
        credentialConfigured: hasValue(env.FIRECRAWL_API_KEY),
        credentialEnvName: "FIRECRAWL_API_KEY"
      }
    }
  };
}

export function summarizeProviderConfig(config: ProviderRuntimeConfig): ProviderConfigSummary {
  const availability = providerAvailabilityList(config);

  return {
    providersMode: config.mode,
    enabledProviderIds: availability.filter((entry) => entry.enabled).map((entry) => entry.providerId),
    disabledProviderIds: availability.filter((entry) => entry.status === "disabled").map((entry) => entry.providerId),
    missingCredentialProviderIds: availability
      .filter((entry) => entry.status === "missing_credentials")
      .map((entry) => entry.providerId)
  };
}

export function providerAvailabilityList(config: ProviderRuntimeConfig): ProviderAvailability[] {
  return Object.values(config.realProviders).map((provider) => createProviderAvailability({
    providerId: provider.providerId,
    platform: provider.platform,
    enabled: provider.enabled,
    credentialConfigured: provider.credentialConfigured,
    missingCredentialName: provider.credentialEnvName
  }));
}

function normalizeProvidersMode(value: string | undefined): ProvidersMode {
  if (value === "mixed" || value === "real") {
    return value;
  }

  return "mock";
}

function realProviderEnabled(mode: ProvidersMode, value: string | undefined): boolean {
  if (mode === "mock") {
    return false;
  }

  return value === "true";
}

function hasValue(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
