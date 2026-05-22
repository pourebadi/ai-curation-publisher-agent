import { readOperationalConfig } from "../config";
import { jsonResponse } from "../http/json";
import { methodNotAllowed, timestamp } from "./response";
import type { Env } from "../types";

export function handleStatus(request: Request, env: Env): Response {
  if (request.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  const config = readOperationalConfig(env);

  return jsonResponse({
    ok: true,
    service: config.serviceName,
    environment: config.environment,
    mockMode: config.mockMode,
    modules: {
      telegram: true,
      ai: true,
      db: Boolean(env.DB),
      providers: true,
      media: true,
      wordpress: true,
      publishing: true
    },
    providers: config.providers,
    telegram: {
      reviewChatConfigured: config.telegram.reviewChatConfigured,
      finalChatConfigured: config.telegram.finalChatConfigured,
      botTokenConfigured: config.telegram.botTokenConfigured,
      realReviewEnabled: config.telegram.realReviewEnabled
    },
    wordpress: {
      configured: config.wordpress.configured,
      baseUrlConfigured: config.wordpress.baseUrlConfigured,
      credentialsConfigured: config.wordpress.credentialsConfigured,
      realDryRunEnabled: config.wordpress.realDryRunEnabled,
      defaultStatus: config.wordpress.defaultStatus
    },
    timestamp: timestamp()
  });
}
