import { redactSensitiveJson, redactSensitiveText } from "./setup";
import type { ApiResult, JsonObject, JsonValue, PilotInput, StatusBundle } from "./types";

export function normalizeApiBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return "";
  }

  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

export class WorkerApiClient {
  private readonly baseUrl: string;
  private readonly internalCredential?: string;

  constructor(baseUrl: string, internalCredential?: string) {
    this.baseUrl = normalizeApiBaseUrl(baseUrl);
    if (internalCredential !== undefined && internalCredential.length > 0) {
      this.internalCredential = internalCredential;
    }
  }

  hasInternalCredential(): boolean {
    return this.internalCredential !== undefined;
  }

  async getStatusBundle(): Promise<StatusBundle> {
    const [health, status, ready] = await Promise.all([
      this.getJson("/health"),
      this.getJson("/status"),
      this.getJson("/ready")
    ]);

    return { health, status, ready };
  }

  async runInternalAuthProbe(): Promise<ApiResult> {
    const withoutSecret = await this.postJson("/internal/e2e/mock-pipeline", {}, false);
    const withSecret = this.internalCredential === undefined
      ? undefined
      : await this.postJson("/internal/e2e/mock-pipeline", {}, true);

    const ok = withoutSecret.status === 401 && withSecret?.ok === true;
    return {
      ok: true,
      status: withSecret?.status ?? withoutSecret.status ?? 0,
      data: {
        ok,
        withoutSecretStatus: withoutSecret.status ?? "network_error",
        withSecretStatus: withSecret?.status ?? "not_run",
        protected: withoutSecret.status === 401,
        credentialWorks: withSecret?.ok === true,
        note: ok ? "Internal auth is protected and the local credential works." : "Internal auth needs attention. Check Cloudflare Worker Secret and the locally entered dashboard credential."
      }
    };
  }

  async runMockE2E(): Promise<ApiResult> {
    return this.postInternalJson("/internal/e2e/mock-pipeline", {});
  }

  async runSchedulerDryRun(): Promise<ApiResult> {
    return this.postInternalJson("/internal/scheduler/run", {
      dryRun: true,
      maxSources: 1,
      maxItems: 1
    });
  }

  async runTelegramReviewDryRun(input: { text: string; sourceUrl?: string }): Promise<ApiResult> {
    const body: JsonObject = { text: input.text };
    if (input.sourceUrl !== undefined && input.sourceUrl.length > 0) {
      body.sourceUrl = input.sourceUrl;
    }
    return this.postInternalJson("/internal/telegram/review-dry-run", body);
  }

  async runWordPressDraftDryRun(input: { title: string; content: string; sourceUrl?: string }): Promise<ApiResult> {
    const body: JsonObject = { title: input.title, content: input.content };
    if (input.sourceUrl !== undefined && input.sourceUrl.length > 0) {
      body.sourceUrl = input.sourceUrl;
    }
    return this.postInternalJson("/internal/wordpress/dry-run", body);
  }

  async runFirecrawlSandboxFetch(input: { url: string }): Promise<ApiResult> {
    return this.postInternalJson("/internal/providers/firecrawl/sandbox-fetch", { url: input.url });
  }

  async runPilot(input: PilotInput): Promise<ApiResult> {
    return this.postInternalJson("/internal/pilot/real-integrations", input as JsonObject);
  }

  private async getJson(path: string): Promise<ApiResult> {
    return this.requestJson(path, { method: "GET" });
  }

  private async postInternalJson(path: string, body: JsonObject): Promise<ApiResult> {
    return this.postJson(path, body, true);
  }

  private async postJson(path: string, body: JsonObject, includeCredential: boolean): Promise<ApiResult> {
    return this.requestJson(path, {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "content-type": "application/json",
        ...(includeCredential && this.internalCredential !== undefined ? { "x-internal-api-secret": this.internalCredential } : {})
      }
    });
  }

  private async requestJson(path: string, init: RequestInit): Promise<ApiResult> {
    if (this.baseUrl.length === 0) {
      return {
        ok: false,
        error: "missing_api_base_url",
        message: "Set the Worker API base URL before running dashboard checks."
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}${path}`, init);
      const data = await readJsonSafely(response);

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: getErrorName(data),
          message: getErrorMessage(data, response.status),
          data: redactSensitiveJson(data)
        };
      }

      return {
        ok: true,
        status: response.status,
        data: redactSensitiveJson(data) as JsonObject
      };
    } catch (error) {
      return {
        ok: false,
        error: "network_error",
        message: error instanceof Error ? redactSensitiveText(error.message) : "Network request failed."
      };
    }
  }
}

async function readJsonSafely(response: Response): Promise<JsonValue> {
  try {
    return await response.json() as JsonValue;
  } catch {
    return null;
  }
}

function getErrorName(value: JsonValue): string {
  if (isObject(value) && typeof value.error === "string") {
    return value.error;
  }

  return "http_error";
}

function getErrorMessage(value: JsonValue, status: number): string {
  if (isObject(value) && typeof value.message === "string") {
    return redactSensitiveText(value.message);
  }

  return `Request failed with HTTP ${status}.`;
}

function isObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
