import { redactSensitiveJson, redactSensitiveText } from "./setup";
import type { AdminConfigResponse, AdminAuditEntry, ApiResult, JsonObject, JsonValue, PilotInput, StatusBundle } from "./types";

export function normalizeApiBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "";
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

export class WorkerApiClient {
  private readonly baseUrl: string;
  private readonly internalCredential?: string;

  constructor(baseUrl: string, internalCredential?: string) {
    this.baseUrl = normalizeApiBaseUrl(baseUrl);
    if (internalCredential !== undefined && internalCredential.length > 0) this.internalCredential = internalCredential;
  }

  async getStatusBundle(): Promise<StatusBundle> {
    const [health, status, ready] = await Promise.all([this.getJson("/health"), this.getJson("/status"), this.getJson("/ready")]);
    return { health, status, ready };
  }

  async getAdminConfig(): Promise<ApiResult<AdminConfigResponse>> {
    return this.getInternalJson("/internal/admin/config") as Promise<ApiResult<AdminConfigResponse>>;
  }

  async saveAdminConfig(updates: { key: string; value: string }[]): Promise<ApiResult<AdminConfigResponse>> {
    return this.putInternalJson("/internal/admin/config", { updates }) as Promise<ApiResult<AdminConfigResponse>>;
  }

  async resetAdminConfig(keys: string[]): Promise<ApiResult<AdminConfigResponse>> {
    return this.postInternalJson("/internal/admin/config/reset", { keys }) as Promise<ApiResult<AdminConfigResponse>>;
  }

  async getAdminConfigAudit(): Promise<ApiResult<{ ok: true; entries: AdminAuditEntry[] }>> {
    return this.getInternalJson("/internal/admin/config/audit") as Promise<ApiResult<{ ok: true; entries: AdminAuditEntry[] }>>;
  }

  async runInternalAuthProbe(): Promise<ApiResult> {
    const withoutSecret = await this.postJson("/internal/e2e/mock-pipeline", {}, false);
    const withSecret = this.internalCredential === undefined ? undefined : await this.postJson("/internal/e2e/mock-pipeline", {}, true);
    const protectedRoute = withoutSecret.status === 401;
    const credentialWorks = withSecret?.ok === true;
    const ok = protectedRoute && credentialWorks;
    const data: JsonObject = { ok, withoutSecretStatus: withoutSecret.status ?? "network_error", withSecretStatus: withSecret?.status ?? "not_run", protected: protectedRoute, credentialWorks, note: ok ? "Internal auth is protected and the local credential works." : "Internal auth needs attention. Check Cloudflare Worker Secret and the locally entered dashboard credential." };
    if (ok) return { ok: true, status: withSecret.status, data };
    return { ok: false, status: withSecret?.status ?? withoutSecret.status ?? 0, error: "internal_auth_probe_failed", message: "Internal auth protection did not pass the expected check.", data };
  }

  async runMockE2E(): Promise<ApiResult> { return this.postInternalJson("/internal/e2e/mock-pipeline", {}); }
  async runSchedulerDryRun(): Promise<ApiResult> { return this.postInternalJson("/internal/scheduler/run", { dryRun: true, maxSources: 1, maxItems: 1 }); }

  async runTelegramReviewDryRun(input: { text: string; sourceUrl?: string }): Promise<ApiResult> {
    const body: JsonObject = { text: input.text };
    if (input.sourceUrl !== undefined && input.sourceUrl.length > 0) body.sourceUrl = input.sourceUrl;
    return this.postInternalJson("/internal/telegram/review-dry-run", body);
  }

  async runWordPressDraftDryRun(input: { title: string; content: string; sourceUrl?: string }): Promise<ApiResult> {
    const body: JsonObject = { title: input.title, content: input.content };
    if (input.sourceUrl !== undefined && input.sourceUrl.length > 0) body.sourceUrl = input.sourceUrl;
    return this.postInternalJson("/internal/wordpress/dry-run", body);
  }

  async runFirecrawlSandboxFetch(input: { url: string }): Promise<ApiResult> { return this.postInternalJson("/internal/providers/firecrawl/sandbox-fetch", { url: input.url }); }
  async runPilot(input: PilotInput): Promise<ApiResult> { return this.postInternalJson("/internal/pilot/real-integrations", input as JsonObject); }

  private async getJson(path: string): Promise<ApiResult> { return this.requestJson(path, { method: "GET" }); }
  private async getInternalJson(path: string): Promise<ApiResult> { return this.requestJson(path, { method: "GET", headers: this.internalHeaders() }); }
  private async putInternalJson(path: string, body: JsonObject): Promise<ApiResult> { return this.requestJson(path, { method: "PUT", body: JSON.stringify(body), headers: this.internalHeaders() }); }
  private async postInternalJson(path: string, body: JsonObject): Promise<ApiResult> { return this.postJson(path, body, true); }

  private async postJson(path: string, body: JsonObject, includeCredential: boolean): Promise<ApiResult> {
    return this.requestJson(path, { method: "POST", body: JSON.stringify(body), headers: includeCredential ? this.internalHeaders() : { "content-type": "application/json" } });
  }

  private internalHeaders(): HeadersInit {
    return { "content-type": "application/json", ...(this.internalCredential !== undefined ? { "x-internal-api-secret": this.internalCredential } : {}) };
  }

  private async requestJson(path: string, init: RequestInit): Promise<ApiResult> {
    if (this.baseUrl.length === 0) return { ok: false, error: "missing_api_base_url", message: "Set the Worker API base URL before running dashboard checks." };
    try {
      const response = await fetch(`${this.baseUrl}${path}`, init);
      const data = await readJsonSafely(response);
      if (!response.ok) return { ok: false, status: response.status, error: getErrorName(data), message: getErrorMessage(data, response.status), data: redactSensitiveJson(data) };
      return { ok: true, status: response.status, data: redactSensitiveJson(data) as JsonObject };
    } catch (error) {
      return { ok: false, error: "network_error", message: error instanceof Error ? redactSensitiveText(error.message) : "Network request failed." };
    }
  }
}

async function readJsonSafely(response: Response): Promise<JsonValue> {
  try { return await response.json() as JsonValue; } catch { return null; }
}

function getErrorName(value: JsonValue): string {
  if (isObject(value) && typeof value.error === "string") return value.error;
  return "http_error";
}

function getErrorMessage(value: JsonValue, status: number): string {
  if (isObject(value) && typeof value.message === "string") return redactSensitiveText(value.message);
  return `Request failed with HTTP ${status}.`;
}

function isObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
