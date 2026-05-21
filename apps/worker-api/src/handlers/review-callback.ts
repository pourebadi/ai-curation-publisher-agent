import { jsonResponse } from "../http/json";

export async function handleReviewCallbackStub(): Promise<Response> {
  return jsonResponse({
    ok: true,
    stub: true,
    message: "Review callbacks are implemented in Phase 2"
  });
}
