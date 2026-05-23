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

  async getStatusBundle(): Promise<StatusBundle> {
    const [health, status, ready] = await Promise.all([
      this.getJson("/health"),
      this.getJson("/status"),
      this.getJson("/ready")
    ]);

    return { health, status, ready };
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

  async runPilot(input: PilotInput): Promise<ApiResult> {
    return this.postInternalJson("/internal/pilot/real-integrations", input as JsonObject);
  }

  private async getJson(path: string): Promise<ApiResult> {
    return this.requestJson(path, { method: "GET" });
  }

  private async postInternalJson(path: string, body: JsonObject): Promise<ApiResult> {
    return this.requestJson(path, {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "content-type": "application/json",
        ...(this.internalCredential === undefined ? {} : { "x-internal-api-secret": this.internalCredential })
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
          data: redactValue(data)
        };
      }

      return {
        ok: true,
        status: response.status,
        data: redactValue(data) as JsonObject
      };
    } catch (error) {
      return {
        ok: false,
        error: "network_error",
        message: error instanceof Error ? redactText(error.message) : "Network request failed."
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
    return redactText(value.message);
  }

  return `Request failed with HTTP ${status}.`;
}

export function redactValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }

  if (!isObject(value)) {
    return typeof value === "string" ? redactText(value) : value;
  }

  const redacted: JsonObject = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (isSensitiveKey(key)) {
      redacted[key] = "[configured locally]";
      continue;
    }
    redacted[key] = redactValue(nestedValue);
  }

  return redacted;
}

function redactText(value: string): string {
  return value.replace(/x-internal-api-secret:\s*[^\s]+/gi, "x-internal-api-secret: [redacted]");
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return normalized.includes("token")
    || normalized.includes("secret")
    || normalized.includes("password")
    || normalized.includes("apikey")
    || normalized.includes("api_key")
    || normalized.includes("authorization")
    || normalized.includes("credential");
}

function isObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
