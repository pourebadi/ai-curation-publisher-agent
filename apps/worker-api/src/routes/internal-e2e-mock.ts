import { runE2EMockPipeline } from "../operations/e2e-mock-pipeline";
import { jsonResponse } from "../http/json";
import { methodNotAllowed, serverError } from "./response";

export async function handleInternalE2EMockPipeline(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  try {
    const result = await runE2EMockPipeline();
    return jsonResponse(result, { status: result.ok ? 200 : 500 });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "e2e_mock_pipeline_failed");
  }
}
