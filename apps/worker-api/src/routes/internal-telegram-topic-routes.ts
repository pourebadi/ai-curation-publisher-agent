import { TelegramRoutesRepository, type UpsertTelegramRouteInput, type UpsertTelegramRouteOutputInput } from "@curator/db";
import { jsonResponse } from "../http/json";
import { verifyInternalRequest } from "../security/internal-auth";
import { badRequest, methodNotAllowed, parseJsonBody, unauthorized } from "./response";
import type { Env } from "../types";

type SeedTelegramRouteOutputBody = {
  id?: unknown;
  language?: unknown;
  reviewChatId?: unknown;
  reviewThreadId?: unknown;
  finalChatId?: unknown;
  finalThreadId?: unknown;
  enabled?: unknown;
};

type SeedTelegramRouteBody = {
  id?: unknown;
  category?: unknown;
  sourceChatId?: unknown;
  sourceThreadId?: unknown;
  promptProfile?: unknown;
  enabled?: unknown;
  outputs?: unknown;
};

type SeedTelegramRoutesBody = {
  routes?: unknown;
};

export async function handleInternalTelegramTopicRoutes(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed(["POST"], request);
  }

  const auth = verifyInternalRequest(request, env);
  if (!auth.ok) {
    return unauthorized(auth.error, "Internal API authorization failed.", request);
  }

  const parsed = await parseJsonBody<SeedTelegramRoutesBody>(request);
  if (!parsed.ok) {
    return parsed.response;
  }

  const normalized = normalizeSeedBody(parsed.value);
  if (!normalized.ok) {
    return badRequest(normalized.error, normalized.message, request);
  }

  const repository = new TelegramRoutesRepository(env.DB);
  const upsertedRoutes: string[] = [];
  const upsertedOutputs: string[] = [];

  for (const route of normalized.routes) {
    await repository.upsertRoute(route.route);
    upsertedRoutes.push(route.route.id);
    for (const output of route.outputs) {
      await repository.upsertRouteOutput(output);
      upsertedOutputs.push(output.id);
    }
  }

  return jsonResponse({
    ok: true,
    seeded: {
      routes: upsertedRoutes,
      outputs: upsertedOutputs
    }
  });
}

function normalizeSeedBody(body: SeedTelegramRoutesBody):
  | { ok: true; routes: Array<{ route: UpsertTelegramRouteInput; outputs: UpsertTelegramRouteOutputInput[] }> }
  | { ok: false; error: string; message: string } {
  if (!Array.isArray(body.routes) || body.routes.length === 0) {
    return { ok: false, error: "invalid_routes", message: "Provide a non-empty routes array." };
  }

  const routes: Array<{ route: UpsertTelegramRouteInput; outputs: UpsertTelegramRouteOutputInput[] }> = [];
  for (const entry of body.routes) {
    if (!isRecord(entry)) {
      return { ok: false, error: "invalid_route", message: "Each route must be an object." };
    }
    const routeBody = entry as SeedTelegramRouteBody;
    const route = normalizeRoute(routeBody);
    if (!route.ok) return route;
    if (!Array.isArray(routeBody.outputs) || routeBody.outputs.length === 0) {
      return { ok: false, error: "invalid_route_outputs", message: `Route ${route.route.id} must include at least one output.` };
    }
    const outputs: UpsertTelegramRouteOutputInput[] = [];
    for (const outputEntry of routeBody.outputs) {
      if (!isRecord(outputEntry)) {
        return { ok: false, error: "invalid_route_output", message: "Each route output must be an object." };
      }
      const output = normalizeOutput(outputEntry as SeedTelegramRouteOutputBody, route.route.id);
      if (!output.ok) return output;
      outputs.push(output.output);
    }
    routes.push({ route: route.route, outputs });
  }

  return { ok: true, routes };
}

function normalizeRoute(body: SeedTelegramRouteBody):
  | { ok: true; route: UpsertTelegramRouteInput }
  | { ok: false; error: string; message: string } {
  const id = readNonEmptyString(body.id);
  const category = readNonEmptyString(body.category);
  const sourceChatId = readNonEmptyString(body.sourceChatId);
  const sourceThreadId = readInteger(body.sourceThreadId);
  const promptProfile = readNonEmptyString(body.promptProfile);
  if (!id || !category || !sourceChatId || sourceThreadId === undefined || !promptProfile) {
    return { ok: false, error: "invalid_route", message: "Route requires id, category, sourceChatId, sourceThreadId, and promptProfile." };
  }
  return { ok: true, route: { id, category, sourceChatId, sourceThreadId, promptProfile, ...(typeof body.enabled === "boolean" ? { enabled: body.enabled } : {}) } };
}

function normalizeOutput(body: SeedTelegramRouteOutputBody, routeId: string):
  | { ok: true; output: UpsertTelegramRouteOutputInput }
  | { ok: false; error: string; message: string } {
  const id = readNonEmptyString(body.id);
  const language = readNonEmptyString(body.language);
  const reviewChatId = readNonEmptyString(body.reviewChatId);
  const reviewThreadId = readInteger(body.reviewThreadId);
  const finalChatId = readNonEmptyString(body.finalChatId);
  const finalThreadId = readInteger(body.finalThreadId);
  if (!id || !language || !reviewChatId || reviewThreadId === undefined || !finalChatId) {
    return { ok: false, error: "invalid_route_output", message: "Route output requires id, language, reviewChatId, reviewThreadId, and finalChatId." };
  }
  return {
    ok: true,
    output: {
      id,
      routeId,
      language,
      reviewChatId,
      reviewThreadId,
      finalChatId,
      ...(finalThreadId === undefined ? {} : { finalThreadId }),
      ...(typeof body.enabled === "boolean" ? { enabled: body.enabled } : {})
    }
  };
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return undefined;
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
