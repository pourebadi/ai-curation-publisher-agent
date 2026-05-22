export type TelegramStructuredOutput = {
  headline: string;
  rewrittenPersianCaption: string;
  shortSummary: string;
  language: string;
  riskFlags: string[];
  relevanceScore: number;
  suggestedHashtags: string[];
  sourceAttributionText: string;
};

export type TelegramOutputValidationResult = {
  valid: boolean;
  output?: TelegramStructuredOutput;
  errors: string[];
};

export const TELEGRAM_OUTPUT_SCHEMA_REF = "telegram_structured_output_v1";

export function validateTelegramStructuredOutput(value: unknown): TelegramOutputValidationResult {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return { valid: false, errors: ["Output must be an object."] };
  }

  const output = value as Record<string, unknown>;
  requireString(output, "headline", errors);
  requireString(output, "rewrittenPersianCaption", errors);
  requireString(output, "shortSummary", errors);
  requireString(output, "language", errors);
  requireString(output, "sourceAttributionText", errors);
  requireStringArray(output, "riskFlags", errors);
  requireStringArray(output, "suggestedHashtags", errors);

  if (typeof output.relevanceScore !== "number" || Number.isNaN(output.relevanceScore)) {
    errors.push("relevanceScore must be a number.");
  } else if (output.relevanceScore < 0 || output.relevanceScore > 1) {
    errors.push("relevanceScore must be between 0 and 1.");
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    output: {
      headline: output.headline as string,
      rewrittenPersianCaption: output.rewrittenPersianCaption as string,
      shortSummary: output.shortSummary as string,
      language: output.language as string,
      riskFlags: output.riskFlags as string[],
      relevanceScore: output.relevanceScore as number,
      suggestedHashtags: output.suggestedHashtags as string[],
      sourceAttributionText: output.sourceAttributionText as string
    }
  };
}

export function parseTelegramStructuredOutput(rawText: string): TelegramOutputValidationResult {
  try {
    return validateTelegramStructuredOutput(JSON.parse(rawText));
  } catch {
    return { valid: false, errors: ["Output must be valid JSON."] };
  }
}

function requireString(output: Record<string, unknown>, field: string, errors: string[]): void {
  if (typeof output[field] !== "string" || output[field].trim().length === 0) {
    errors.push(`${field} must be a non-empty string.`);
  }
}

function requireStringArray(output: Record<string, unknown>, field: string, errors: string[]): void {
  if (!Array.isArray(output[field]) || !(output[field] as unknown[]).every((value) => typeof value === "string")) {
    errors.push(`${field} must be an array of strings.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
