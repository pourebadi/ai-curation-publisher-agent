export type ProviderHttpRequestOptions = {
  headers?: Record<string, string>;
  timeoutMs?: number;
};

export interface ProviderHttpClient {
  getJson<T>(url: string, options?: ProviderHttpRequestOptions): Promise<T>;
  postJson<T>(url: string, body: unknown, options?: ProviderHttpRequestOptions): Promise<T>;
}
