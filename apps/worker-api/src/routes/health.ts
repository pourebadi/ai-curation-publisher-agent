import type { Env } from "../types";
import { jsonResponse } from "../http/json";

export function handleHealth(_request: Request, env: Env): Response {
  return jsonResponse({
    ok: true,
    service: "ai-curation-publisher-agent",
    phase: "phase-01-repo-bootstrap",
    environment: env.ENVIRONMENT ?? "unknown"
  });
}
