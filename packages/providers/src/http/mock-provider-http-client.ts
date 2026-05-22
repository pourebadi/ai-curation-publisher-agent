import type { ProviderHttpClient, ProviderHttpRequestOptions } from "./provider-http-client";

export type MockProviderHttpClientResponse = {
  method: "GET" | "POST";
  url: string;
  response: unknown;
};

export class MockProviderHttpClient implements ProviderHttpClient {
  readonly requests: Array<{ method: "GET" | "POST"; url: string; body?: unknown; options?: ProviderHttpRequestOptions }> = [];

  constructor(private readonly responses: MockProviderHttpClientResponse[] = []) {}

  async getJson<T>(url: string, options?: ProviderHttpRequestOptions): Promise<T> {
    this.requests.push({ method: "GET", url, ...(options === undefined ? {} : { options }) });
    return this.findResponse<T>("GET", url);
  }

  async postJson<T>(url: string, body: unknown, options?: ProviderHttpRequestOptions): Promise<T> {
    this.requests.push({ method: "POST", url, body, ...(options === undefined ? {} : { options }) });
    return this.findResponse<T>("POST", url);
  }

  private findResponse<T>(method: "GET" | "POST", url: string): T {
    const response = this.responses.find((candidate) => candidate.method === method && candidate.url === url);
    if (!response) {
      throw new Error(`No mock provider HTTP response configured for ${method} ${url}`);
    }

    return response.response as T;
  }
}
