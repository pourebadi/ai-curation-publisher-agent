import type { Platform, Source, SourceType } from "@curator/core";
import { IngestGateService } from "@curator/db";
import { BatchPollerService, MockSocialProvider, SourcePollerService, type PollIngestGate } from "@curator/providers";
import { jsonResponse } from "../http/json";
import { methodNotAllowed, parseJsonBody, serverError } from "./response";
import type { Env } from "../types";

type InternalPollRequestBody = {
  sources?: Partial<Source>[];
  options?: {
    limit?: number;
    backfillLimit?: number;
    since?: string;
    cursor?: string;
    providerPriority?: string[];
    useIngestGate?: boolean;
  };
};

export async function handleInternalPoll(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  const parsed = await parseJsonBody<InternalPollRequestBody>(request);
  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const body = parsed.value;
    const sources = normalizeSources(body.sources);
    const ingestGate = body.options?.useIngestGate ? createIngestGateAdapter(env) : undefined;
    const sourcePoller = new SourcePollerService({
      providers: createMockProviders(),
      ...(ingestGate === undefined ? {} : { ingestGate })
    });
    const batchPoller = new BatchPollerService(sourcePoller);
    const result = await batchPoller.pollSources(sources, {
      ...(body.options?.limit === undefined ? {} : { limit: body.options.limit }),
      ...(body.options?.backfillLimit === undefined ? {} : { backfillLimit: body.options.backfillLimit }),
      ...(body.options?.since === undefined ? {} : { since: body.options.since }),
      ...(body.options?.cursor === undefined ? {} : { cursor: body.options.cursor }),
      ...(body.options?.providerPriority === undefined ? {} : { providerPriority: body.options.providerPriority })
    });

    return jsonResponse({
      ok: true,
      mockMode: true,
      totalSources: result.totalSources,
      successfulSources: result.successfulSources,
      failedSources: result.failedSources,
      totalReturned: result.totalReturned,
      totalQueued: result.totalQueued,
      totalDuplicates: result.totalDuplicates,
      totalInvalid: result.totalInvalid,
      totalErrors: result.totalErrors,
      perSource: result.sourceResults
    });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "internal_poll_failed");
  }
}

function createMockProviders(): MockSocialProvider[] {
  return [
    new MockSocialProvider({ id: "mock_instagram", platform: "instagram" }),
    new MockSocialProvider({ id: "mock_x", platform: "x" }),
    new MockSocialProvider({ id: "mock_web", platform: "web" })
  ];
}

function createIngestGateAdapter(env: Env): PollIngestGate {
  const ingestGate = new IngestGateService(env.DB);
  return {
    async processNormalizedPost(input) {
      if ("process" in ingestGate && typeof ingestGate.process === "function") {
        return ingestGate.process(input);
      }

      const normalizedPostProcessor = ingestGate as unknown as {
        processNormalizedPost(input: Parameters<PollIngestGate["processNormalizedPost"]>[0]): ReturnType<PollIngestGate["processNormalizedPost"]>;
      };
      return normalizedPostProcessor.processNormalizedPost(input);
    }
  };
}

function normalizeSources(inputSources: Partial<Source>[] | undefined): Source[] {
  const sources = inputSources && inputSources.length > 0 ? inputSources : defaultMockSources();
  return sources.map((source, index) => {
    const platform = normalizePlatform(source.platform, index);
    const sourceType = normalizeSourceType(source.sourceType, platform);
    const id = source.id ?? `source_${platform}_${index + 1}`;
    const value = source.value ?? defaultSourceValue(platform, sourceType);

    return {
      id,
      platform,
      sourceType,
      value,
      providerPriority: source.providerPriority ?? [`mock_${platform === "x" ? "x" : platform}`],
      status: source.status ?? "active",
      watermark: source.watermark ?? {},
      settings: source.settings ?? {},
      createdAt: source.createdAt ?? new Date(0).toISOString(),
      updatedAt: source.updatedAt ?? new Date(0).toISOString()
    };
  });
}

function defaultMockSources(): Partial<Source>[] {
  return [
    {
      id: "source_instagram_demo",
      platform: "instagram",
      sourceType: "profile",
      value: "demo_profile",
      providerPriority: ["mock_instagram"]
    },
    {
      id: "source_x_demo",
      platform: "x",
      sourceType: "hashtag",
      value: "ai",
      providerPriority: ["mock_x"]
    },
    {
      id: "source_web_demo",
      platform: "web",
      sourceType: "web_url",
      value: "https://source.local/demo",
      providerPriority: ["mock_web"]
    }
  ];
}

function normalizePlatform(value: Source["platform"] | undefined, index: number): Platform {
  if (value === "instagram" || value === "x" || value === "web" || value === "manual") {
    return value;
  }

  return index === 1 ? "x" : index === 2 ? "web" : "instagram";
}

function normalizeSourceType(value: Source["sourceType"] | undefined, platform: Platform): SourceType {
  if (value === "profile" || value === "hashtag" || value === "query" || value === "direct_url" || value === "web_url" || value === "manual") {
    return value;
  }

  return platform === "web" ? "web_url" : "profile";
}

function defaultSourceValue(platform: Platform, sourceType: SourceType): string {
  if (platform === "web" || sourceType === "web_url" || sourceType === "direct_url") {
    return "https://source.local/demo";
  }

  return platform === "x" ? "ai" : "demo_profile";
}
