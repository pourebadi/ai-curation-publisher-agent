import { getEffectiveEnv, getEncryptionSummary } from "../admin-config/service";
import { validateRuntimeConfig } from "../config";
import { jsonResponse } from "../http/json";
import { methodNotAllowed, timestamp } from "./response";
import type { Env } from "../types";

export async function handleReady(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed(["GET"], request);
  }

  const effectiveEnv = await getEffectiveEnv(env);
  const validation = validateRuntimeConfig(effectiveEnv);
  const encryption = await getEncryptionSummary(env);
  const warnings = [...validation.warnings];
  if (!encryption.secretEditingEnabled) {
    warnings.push("CONFIG_ENCRYPTION_KEY is not configured or invalid. Dashboard secret editing is disabled.");
  }

  return jsonResponse({
    ok: validation.ready,
    ready: validation.ready,
    summary: validation.summary,
    adminConfig: {
      encryptionConfigured: encryption.configured,
      encryptionValid: encryption.valid,
      secretEditingEnabled: encryption.secretEditingEnabled
    },
    warnings,
    errors: validation.errors,
    timestamp: timestamp()
  }, { status: validation.ready ? 200 : 503 });
}
