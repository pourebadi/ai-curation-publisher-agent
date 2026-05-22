import { jsonResponse } from "../http/json";

export type JsonParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; response: Response };

export function methodNotAllowed(allowedMethods: string[]): Response {
  return jsonResponse({ ok: false, error: "method_not_allowed", allowedMethods }, {
    status: 405,
    headers: { allow: allowedMethods.join(", ") }
  });
}

export function badRequest(error: string): Response {
  return jsonResponse({ ok: false, error }, { status: 400 });
}

export function serverError(error: string): Response {
  return jsonResponse({ ok: false, error }, { status: 500 });
}

export async function parseJsonBody<T>(request: Request): Promise<JsonParseResult<T>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return { ok: false, response: badRequest("expected_json_body") };
  }

  const value = await request.json().catch(() => null) as T | null;
  if (value === null || typeof value !== "object") {
    return { ok: false, response: badRequest("malformed_json") };
  }

  return { ok: true, value };
}

export function timestamp(): string {
  return new Date().toISOString();
}
