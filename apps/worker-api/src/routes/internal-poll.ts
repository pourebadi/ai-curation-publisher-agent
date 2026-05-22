import type { Source } from "@curator/core";
import { runMockPollOperation, type OperationalPollOptions } from "../operations/mock-poll";
import { jsonResponse } from "../http/json";
import { methodNotAllowed, parseJsonBody, serverError } from "./response";
import type { Env } from "../types";

type InternalPollRequestBody = {
  sources?: Partial<Source>[];
  options?: OperationalPollOptions;
};

export async function handleInternalPoll(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  const parsed = await parseJsonBody<InternalPollRequestBody>(request);
  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const result = await runMockPollOperation({
      env,
      sources: parsed.value.sources,
      options: parsed.value.options
    });

    return jsonResponse(result);
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "internal_poll_failed");
  }
}
