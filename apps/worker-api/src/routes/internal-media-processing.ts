import { MediaProcessingJobsRepository } from "@curator/db";
import { jsonResponse } from "../http/json";
import { completeMediaProcessingJob, type CompleteMediaProcessingJobInput } from "../operations/media-processing";
import { verifyInternalRequest } from "../security/internal-auth";
import { badRequest, methodNotAllowed, parseJsonBody, serverError, unauthorized } from "./response";
import type { Env } from "../types";

export async function handleInternalMediaProcessing(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/internal/media/processing/callback") return handleCallback(request, env);
  if (url.pathname === "/internal/media/processing/jobs") return handleJobs(request, env);
  return methodNotAllowed(["GET", "POST"], request);
}

async function handleCallback(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed(["POST"], request);
  const auth = verifyInternalRequest(request, env);
  if (!auth.ok) return unauthorized(auth.error, "Internal API authorization failed.", request);
  const parsed = await parseJsonBody<CompleteMediaProcessingJobInput>(request);
  if (!parsed.ok) return parsed.response;
  if (!parsed.value.jobId || !parsed.value.status) {
    return badRequest("missing_media_callback_fields", "jobId and status are required.", request);
  }
  try {
    const result = await completeMediaProcessingJob(env, parsed.value);
    return jsonResponse(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return serverError("media_processing_callback_failed", error instanceof Error ? error.message : "Media processing callback failed.", request);
  }
}

async function handleJobs(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") return methodNotAllowed(["GET"], request);
  const auth = verifyInternalRequest(request, env);
  if (!auth.ok) return unauthorized(auth.error, "Internal API authorization failed.", request);
  const url = new URL(request.url);
  const limit = clampLimit(Number(url.searchParams.get("limit") ?? 50));
  const status = url.searchParams.get("status") ?? undefined;
  const repository = new MediaProcessingJobsRepository(env.DB);
  const jobs = await repository.listRecent(limit, isKnownStatus(status) ? status : undefined);
  return jsonResponse({ ok: true, jobs });
}

function clampLimit(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(100, Math.max(1, Math.floor(value)));
}

function isKnownStatus(value: string | undefined): value is "pending" | "dispatching" | "dispatched" | "processing" | "ready" | "failed" | "skipped" {
  return value === "pending" || value === "dispatching" || value === "dispatched" || value === "processing" || value === "ready" || value === "failed" || value === "skipped";
}
