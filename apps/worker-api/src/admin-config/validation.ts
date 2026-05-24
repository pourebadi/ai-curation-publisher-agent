import type { AdminConfigDefinition } from "./allowlist";

export type AdminConfigValidationResult =
  | { ok: true; value: string }
  | { ok: false; error: string; message: string };

export function validateAdminConfigValue(definition: AdminConfigDefinition, rawValue: unknown): AdminConfigValidationResult {
  if (typeof rawValue !== "string" && typeof rawValue !== "number" && typeof rawValue !== "boolean") {
    return { ok: false, error: "invalid_value_type", message: `${definition.key} must be a string, number, or boolean.` };
  }

  const value = String(rawValue).trim();
  if (value.length === 0) {
    return { ok: false, error: "empty_value", message: `${definition.key} cannot be empty.` };
  }

  if (definition.isSecret) {
    return { ok: true, value };
  }

  switch (definition.valueType) {
    case "boolean":
      if (value !== "true" && value !== "false") {
        return { ok: false, error: "invalid_boolean", message: `${definition.key} must be exactly true or false.` };
      }
      return { ok: true, value };
    case "integer": {
      if (!/^\d+$/.test(value)) {
        return { ok: false, error: "invalid_integer", message: `${definition.key} must be an integer.` };
      }
      const parsed = Number.parseInt(value, 10);
      if (!Number.isSafeInteger(parsed)) {
        return { ok: false, error: "invalid_integer", message: `${definition.key} must be a safe integer.` };
      }
      if (definition.min !== undefined && parsed < definition.min) {
        return { ok: false, error: "value_too_small", message: `${definition.key} must be at least ${definition.min}.` };
      }
      if (definition.max !== undefined && parsed > definition.max) {
        return { ok: false, error: "value_too_large", message: `${definition.key} must be at most ${definition.max}.` };
      }
      return { ok: true, value: String(parsed) };
    }
    case "url": {
      let parsed: URL;
      try {
        parsed = new URL(value);
      } catch {
        return { ok: false, error: "invalid_url", message: `${definition.key} must be a valid URL.` };
      }
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return { ok: false, error: "invalid_url_protocol", message: `${definition.key} must use http or https.` };
      }
      if (definition.preferHttps === true && parsed.protocol !== "https:") {
        return { ok: false, error: "https_required", message: `${definition.key} must use https.` };
      }
      return { ok: true, value: parsed.toString() };
    }
    case "enum":
      if (definition.enumValues === undefined || !definition.enumValues.includes(value)) {
        return { ok: false, error: "invalid_enum", message: `${definition.key} must be one of: ${(definition.enumValues ?? []).join(", ")}.` };
      }
      return { ok: true, value };
    case "string":
      return { ok: true, value };
    case "secret":
      return { ok: true, value };
    default:
      return { ok: false, error: "unsupported_value_type", message: `${definition.key} has unsupported type.` };
  }
}
