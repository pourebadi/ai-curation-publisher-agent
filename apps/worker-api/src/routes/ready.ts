import { validateRuntimeConfig } from "../config";
import { jsonResponse } from "../http/json";
import { methodNotAllowed, timestamp } from "./response";
import type { Env } from "../types";

export function handleReady(request: Request, env: Env): Response {
  if (request.method !== "GET") {
    return methodNotAllowed(["GET"], request);
  }

  const validation = validateRuntimeConfig(env);

  return jsonResponse({
    ok: validation.ready,
    ready: validation.ready,
    summary: validation.summary,
    warnings: validation.warnings,
    errors: validation.errors,
    timestamp: timestamp()
  }, { status: validation.ready ? 200 : 503 });
}
