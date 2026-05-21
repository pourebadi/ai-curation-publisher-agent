import { jsonResponse } from "../http/json";

export async function handleManualIngestStub(): Promise<Response> {
  return jsonResponse({
    ok: true,
    stub: true,
    message: "Manual ingest is implemented in Phase 2"
  });
}
