import { TelegramRoutesRepository, type TelegramRouteOutputRecord, type TelegramRouteRecord, type UpsertTelegramRouteInput, type UpsertTelegramRouteOutputInput } from "@curator/db";
import { jsonResponse } from "../http/json";
import { verifyInternalRequest } from "../security/internal-auth";
import { badRequest, methodNotAllowed, parseJsonBody, unauthorized } from "./response";
import type { Env } from "../types";

type TelegramRouteOutputBody = {
  id?: unknown;
  language?: unknown;
  reviewChatId?: unknown;
  reviewThreadId?: unknown;
  finalChatId?: unknown;
  finalThreadId?: unknown;
  enabled?: unknown;
};

type TelegramRouteBody = {
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
  const auth = verifyInternalRequest(request, env);
  if (!auth.ok) {
    return unauthorized(auth.error, "Internal API authorization failed.", request);
  }

  const url = new URL(request.url);
  const path = url.pathname;
  const repository = new TelegramRoutesRepository(env.DB);

  if (path === "/internal/telegram/topic-routes" && request.method === "GET") {
    return jsonResponse({ ok: true, ...(await readRouteManagerState(repository)) });
  }

  if (path === "/internal/telegram/topic-routes" && request.method === "POST") {
    return handleCreateRoute(request, repository);
  }

  if (path === "/internal/telegram/topic-routes/seed" && request.method === "POST") {
    return handleSeedRoutes(request, repository);
  }

  if (path === "/internal/telegram/topic-routes/validate" && request.method === "POST") {
    return jsonResponse({ ok: true, validation: await validateStoredRoutes(repository) });
  }

  const routeOutputMatch = path.match(/^\/internal\/telegram\/topic-route-outputs\/([^/]+)(?:\/(disable))?$/);
  if (routeOutputMatch) {
    const outputId = decodeURIComponent(routeOutputMatch[1] ?? "");
    const action = routeOutputMatch[2];
    if (action === "disable" && request.method === "POST") {
      const disabled = await repository.disableRouteOutput(outputId);
      return jsonResponse({ ok: disabled, outputId, disabled });
    }
    if (action === undefined && request.method === "PUT") {
      return handleUpdateOutput(request, repository, outputId);
    }
    return methodNotAllowed(action === "disable" ? ["POST"] : ["PUT"], request);
  }

  const routeMatch = path.match(/^\/internal\/telegram\/topic-routes\/([^/]+)(?:\/(disable|outputs))?$/);
  if (routeMatch) {
    const routeId = decodeURIComponent(routeMatch[1] ?? "");
    const action = routeMatch[2];
    if (action === undefined && request.method === "PUT") {
      return handleUpdateRoute(request, repository, routeId);
    }
    if (action === "disable" && request.method === "POST") {
      const disabled = await repository.disableRoute(routeId);
      return jsonResponse({ ok: disabled, routeId, disabled });
    }
    if (action === "outputs" && request.method === "POST") {
      return handleCreateOutput(request, repository, routeId);
    }
    return methodNotAllowed(action === undefined ? ["PUT"] : ["POST"], request);
  }

  return methodNotAllowed(["GET", "POST", "PUT"], request);
}

async function handleCreateRoute(request: Request, repository: TelegramRoutesRepository): Promise<Response> {
  const parsed = await parseJsonBody<TelegramRouteBody>(request);
  if (!parsed.ok) return parsed.response;
  const normalized = normalizeRoute(parsed.value);
  if (!normalized.ok) return badRequest(normalized.error, normalized.message, request);
  const duplicate = await repository.findRouteBySource(normalized.route.sourceChatId, normalized.route.sourceThreadId);
  if (duplicate && duplicate.id !== normalized.route.id) {
    return badRequest("duplicate_source_topic", "Another route already uses this source chat ID and topic ID.", request);
  }
  const route = await repository.upsertRoute(normalized.route);
  return jsonResponse({ ok: true, route });
}

async function handleUpdateRoute(request: Request, repository: TelegramRoutesRepository, routeId: string): Promise<Response> {
  const existing = await repository.findRouteById(routeId);
  if (!existing) return badRequest("route_not_found", "Route was not found.", request);
  const parsed = await parseJsonBody<TelegramRouteBody>(request);
  if (!parsed.ok) return parsed.response;
  const normalized = normalizeRoute({ ...parsed.value, id: routeId });
  if (!normalized.ok) return badRequest(normalized.error, normalized.message, request);
  const duplicate = await repository.findRouteBySource(normalized.route.sourceChatId, normalized.route.sourceThreadId);
  if (duplicate && duplicate.id !== routeId) {
    return badRequest("duplicate_source_topic", "Another route already uses this source chat ID and topic ID.", request);
  }
  const route = await repository.upsertRoute(normalized.route);
  return jsonResponse({ ok: true, route });
}

async function handleCreateOutput(request: Request, repository: TelegramRoutesRepository, routeId: string): Promise<Response> {
  const route = await repository.findRouteById(routeId);
  if (!route) return badRequest("route_not_found", "Route was not found.", request);
  const parsed = await parseJsonBody<TelegramRouteOutputBody>(request);
  if (!parsed.ok) return parsed.response;
  const normalized = normalizeOutput(parsed.value, routeId);
  if (!normalized.ok) return badRequest(normalized.error, normalized.message, request);
  const existing = await repository.findOutputById(normalized.output.id);
  if (existing && existing.id !== normalized.output.id) {
    return badRequest("duplicate_output_id", "Another route output already uses this output ID.", request);
  }
  const output = await repository.upsertRouteOutput(normalized.output);
  return jsonResponse({ ok: true, output });
}

async function handleUpdateOutput(request: Request, repository: TelegramRoutesRepository, outputId: string): Promise<Response> {
  const existing = await repository.findOutputById(outputId);
  if (!existing) return badRequest("route_output_not_found", "Route output was not found.", request);
  const parsed = await parseJsonBody<TelegramRouteOutputBody>(request);
  if (!parsed.ok) return parsed.response;
  const normalized = normalizeOutput({ ...parsed.value, id: outputId }, existing.routeId);
  if (!normalized.ok) return badRequest(normalized.error, normalized.message, request);
  const output = await repository.upsertRouteOutput(normalized.output);
  return jsonResponse({ ok: true, output });
}

async function handleSeedRoutes(request: Request, repository: TelegramRoutesRepository): Promise<Response> {
  const parsed = await parseJsonBody<SeedTelegramRoutesBody>(request);
  if (!parsed.ok) return parsed.response;
  const normalized = normalizeSeedBody(parsed.value);
  if (!normalized.ok) return badRequest(normalized.error, normalized.message, request);
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
  return jsonResponse({ ok: true, seeded: { routes: upsertedRoutes, outputs: upsertedOutputs } });
}

async function readRouteManagerState(repository: TelegramRoutesRepository): Promise<{ routes: Array<TelegramRouteRecord & { outputs: TelegramRouteOutputRecord[] }>; validation: RouteValidationSummary }> {
  const routes = await repository.listRoutes();
  const outputs = await repository.listOutputs();
  const routeCards = routes.map((route) => ({ ...route, outputs: outputs.filter((output) => output.routeId === route.id) }));
  return { routes: routeCards, validation: validateRouteRecords(routeCards) };
}

async function validateStoredRoutes(repository: TelegramRoutesRepository): Promise<RouteValidationSummary> {
  const state = await readRouteManagerState(repository);
  return state.validation;
}

type RouteValidationIssue = { routeId?: string; outputId?: string; code: string; message: string };
type RouteValidationSummary = { valid: boolean; invalidRouteCount: number; issues: RouteValidationIssue[] };

function validateRouteRecords(routes: Array<TelegramRouteRecord & { outputs: TelegramRouteOutputRecord[] }>): RouteValidationSummary {
  const issues: RouteValidationIssue[] = [];
  const sourceKeys = new Map<string, string>();
  const outputIds = new Set<string>();
  for (const route of routes) {
    if (!route.sourceChatId.trim()) issues.push({ routeId: route.id, code: "missing_source_chat_id", message: "Source chat ID is required." });
    if (!Number.isInteger(route.sourceThreadId)) issues.push({ routeId: route.id, code: "invalid_source_thread_id", message: "Source topic ID must be numeric." });
    const key = `${route.sourceChatId}:${route.sourceThreadId}`;
    const duplicateRouteId = sourceKeys.get(key);
    if (duplicateRouteId && duplicateRouteId !== route.id) issues.push({ routeId: route.id, code: "duplicate_source_topic", message: "Another route uses the same source chat and topic ID." });
    sourceKeys.set(key, route.id);
    const enabledOutputs = route.outputs.filter((output) => output.enabled);
    if (route.enabled && enabledOutputs.length === 0) issues.push({ routeId: route.id, code: "enabled_route_has_no_enabled_outputs", message: "Enabled routes need at least one enabled output." });
    for (const output of route.outputs) {
      if (outputIds.has(output.id)) issues.push({ routeId: route.id, outputId: output.id, code: "duplicate_output_id", message: "Duplicate output ID." });
      outputIds.add(output.id);
      if (!output.reviewChatId.trim()) issues.push({ routeId: route.id, outputId: output.id, code: "missing_review_chat_id", message: "Review chat ID is required." });
      if (!Number.isInteger(output.reviewThreadId)) issues.push({ routeId: route.id, outputId: output.id, code: "invalid_review_thread_id", message: "Review topic ID must be numeric." });
      if (!output.finalChatId.trim()) issues.push({ routeId: route.id, outputId: output.id, code: "missing_final_chat_id", message: "Final channel/chat ID is required." });
    }
  }
  return { valid: issues.length === 0, invalidRouteCount: new Set(issues.map((issue) => issue.routeId).filter(Boolean)).size, issues };
}

function normalizeSeedBody(body: SeedTelegramRoutesBody):
  | { ok: true; routes: Array<{ route: UpsertTelegramRouteInput; outputs: UpsertTelegramRouteOutputInput[] }> }
  | { ok: false; error: string; message: string } {
  if (!Array.isArray(body.routes) || body.routes.length === 0) return { ok: false, error: "invalid_routes", message: "Provide a non-empty routes array." };
  const routes: Array<{ route: UpsertTelegramRouteInput; outputs: UpsertTelegramRouteOutputInput[] }> = [];
  for (const entry of body.routes) {
    if (!isRecord(entry)) return { ok: false, error: "invalid_route", message: "Each route must be an object." };
    const routeBody = entry as TelegramRouteBody;
    const route = normalizeRoute(routeBody);
    if (!route.ok) return route;
    if (!Array.isArray(routeBody.outputs) || routeBody.outputs.length === 0) return { ok: false, error: "invalid_route_outputs", message: `Route ${route.route.id} must include at least one output.` };
    const outputs: UpsertTelegramRouteOutputInput[] = [];
    for (const outputEntry of routeBody.outputs) {
      if (!isRecord(outputEntry)) return { ok: false, error: "invalid_route_output", message: "Each route output must be an object." };
      const output = normalizeOutput(outputEntry as TelegramRouteOutputBody, route.route.id);
      if (!output.ok) return output;
      outputs.push(output.output);
    }
    routes.push({ route: route.route, outputs });
  }
  return { ok: true, routes };
}

function normalizeRoute(body: TelegramRouteBody):
  | { ok: true; route: UpsertTelegramRouteInput }
  | { ok: false; error: string; message: string } {
  const id = readNonEmptyString(body.id);
  const category = readNonEmptyString(body.category);
  const sourceChatId = readNonEmptyString(body.sourceChatId);
  const sourceThreadId = readInteger(body.sourceThreadId);
  const promptProfile = readNonEmptyString(body.promptProfile);
  if (!id || !category || !sourceChatId || sourceThreadId === undefined || !promptProfile) return { ok: false, error: "invalid_route", message: "Route requires id, category, sourceChatId, sourceThreadId, and promptProfile." };
  return { ok: true, route: { id, category, sourceChatId, sourceThreadId, promptProfile, ...(typeof body.enabled === "boolean" ? { enabled: body.enabled } : {}) } };
}

function normalizeOutput(body: TelegramRouteOutputBody, routeId: string):
  | { ok: true; output: UpsertTelegramRouteOutputInput }
  | { ok: false; error: string; message: string } {
  const id = readNonEmptyString(body.id);
  const language = readNonEmptyString(body.language);
  const reviewChatId = readNonEmptyString(body.reviewChatId);
  const reviewThreadId = readInteger(body.reviewThreadId);
  const finalChatId = readNonEmptyString(body.finalChatId);
  const finalThreadId = readInteger(body.finalThreadId);
  if (!id || !language || !reviewChatId || reviewThreadId === undefined || !finalChatId) return { ok: false, error: "invalid_route_output", message: "Route output requires id, language, reviewChatId, reviewThreadId, and finalChatId." };
  return { ok: true, output: { id, routeId, language, reviewChatId, reviewThreadId, finalChatId, ...(finalThreadId === undefined ? {} : { finalThreadId }), ...(typeof body.enabled === "boolean" ? { enabled: body.enabled } : {}) } };
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
