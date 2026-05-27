import { AIOutputService, buildLocalizedTelegramPrompt, CustomJsonAIProvider, GeminiGenerateContentProvider, MockAIProvider, OpenAIChatCompletionsProvider, renderLocalizedTemplateValues, renderTelegramPrompt, type PromptDefinition } from "@curator/ai";
import { PromptProfilesRepository, type PromptProfileRecord, type TelegramLocalizedOutput, type TelegramRouteOutputRecord, type TelegramRouteRecord } from "@curator/db";
import type { NormalizedPost } from "@curator/core";
import type { Env } from "../types";
import { buildChannelSignaturePreview } from "./channel-signature";

export type BuildLocalizedTelegramOutputInput = {
  route: TelegramRouteRecord;
  routeOutput: TelegramRouteOutputRecord;
  post: NormalizedPost;
  sourceAttributionText: string;
};

export type GenerateLocalizedTelegramOutputInput = BuildLocalizedTelegramOutputInput & {
  env: Env;
  itemId: string;
};

export type GenerateLocalizedTelegramOutputResult = {
  output: TelegramLocalizedOutput;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
};

export async function generateLocalizedTelegramOutput(input: GenerateLocalizedTelegramOutputInput): Promise<GenerateLocalizedTelegramOutputResult> {
  const aiProvider = normalizeAiProvider(input.env.AI_PROVIDER);
  if (aiProvider === "mock") {
    return {
      output: buildMockLocalizedTelegramOutput(input),
      model: "mock"
    };
  }

  const model = input.env.AI_MODEL?.trim() || defaultModelForProvider(aiProvider);
  const promptContext = {
    post: input.post,
    category: input.route.category,
    language: input.routeOutput.language,
    promptProfile: input.route.promptProfile,
    sourceAttributionText: input.sourceAttributionText,
    model,
    temperature: readNumber(input.env.AI_TEMPERATURE, 0.4),
    maxTokens: readInteger(input.env.AI_MAX_OUTPUT_TOKENS, 1200),
    ...(input.env.AI_CUSTOM_SYSTEM_PROMPT === undefined ? {} : { customSystemPrompt: input.env.AI_CUSTOM_SYSTEM_PROMPT })
  };
  const promptResolution = await resolveRuntimePrompt(input, promptContext);
  const service = new AIOutputService(createProvider(input.env, aiProvider, promptResolution.prompt.model));
  const result = await service.generateTelegramOutput({
    itemId: input.itemId,
    post: input.post,
    sourceAttributionText: input.sourceAttributionText,
    prompt: promptResolution.prompt,
    templateValues: promptResolution.templateValues
  });

  return {
    output: {
      language: input.routeOutput.language,
      headline: result.output.headline,
      caption: result.output.rewrittenPersianCaption,
      summary: result.output.shortSummary,
      hashtags: result.output.suggestedHashtags,
      riskFlags: result.output.riskFlags,
      relevanceScore: result.output.relevanceScore,
      sourceAttributionText: result.output.sourceAttributionText || input.sourceAttributionText
    },
    model: result.model,
    ...(result.inputTokens === undefined ? {} : { inputTokens: result.inputTokens }),
    ...(result.outputTokens === undefined ? {} : { outputTokens: result.outputTokens })
  };
}

export function buildMockLocalizedTelegramOutput(input: BuildLocalizedTelegramOutputInput): TelegramLocalizedOutput {
  const sourceText = input.post.text?.trim() || "Source content has no text caption.";
  const language = input.routeOutput.language;
  return {
    language,
    headline: `${input.route.category} update (${language})`,
    caption: sourceText,
    summary: `Mock ${language} summary for ${input.route.category}.`,
    hashtags: [`#${input.route.category}`, `#${language}`],
    riskFlags: [],
    relevanceScore: 0.82,
    sourceAttributionText: input.sourceAttributionText
  };
}


async function resolveRuntimePrompt(input: GenerateLocalizedTelegramOutputInput, promptContext: Parameters<typeof buildLocalizedTelegramPrompt>[0]): Promise<{ prompt: PromptDefinition; templateValues: Record<string, string> }> {
  const fallbackPrompt = buildLocalizedTelegramPrompt(promptContext);
  const fallbackTemplateValues = buildTemplateValues(input, promptContext);
  try {
    const repository = new PromptProfilesRepository(input.env.DB);
    const storedPrompt = await repository.resolvePrompt({
      routeId: input.route.id,
      routeOutputId: input.routeOutput.id,
      category: input.route.category,
      language: input.routeOutput.language,
      contentType: "social_post",
      promptProfileKey: input.route.promptProfile
    });
    if (!storedPrompt) return { prompt: fallbackPrompt, templateValues: fallbackTemplateValues };
    return { prompt: storedPromptToPromptDefinition(storedPrompt, fallbackPrompt), templateValues: fallbackTemplateValues };
  } catch {
    return { prompt: fallbackPrompt, templateValues: fallbackTemplateValues };
  }
}

function storedPromptToPromptDefinition(profile: PromptProfileRecord, fallback: PromptDefinition): PromptDefinition {
  return {
    promptId: profile.id,
    promptVersion: profile.version,
    target: fallback.target,
    systemPrompt: profile.systemPrompt,
    userPromptTemplate: profile.userPromptTemplate,
    model: profile.modelHint ?? fallback.model,
    temperature: profile.temperature ?? fallback.temperature,
    maxTokens: profile.maxTokens ?? fallback.maxTokens,
    outputSchemaRef: profile.outputSchemaRef || fallback.outputSchemaRef
  };
}

function buildTemplateValues(input: GenerateLocalizedTelegramOutputInput, promptContext: Parameters<typeof buildLocalizedTelegramPrompt>[0]): Record<string, string> {
  const baseValues = renderLocalizedTemplateValues(promptContext);
  const channelSignature = buildChannelSignaturePreview(input.routeOutput).rendered;
  return {
    ...baseValues,
    sourceText: input.post.text ?? "",
    sourceUrl: input.post.canonicalUrl,
    contentType: "social_post",
    tonePreset: input.env.AI_TONE_PRESET ?? "neutral",
    channelSignature,
    targetAudience: `${input.route.category} Telegram audience`,
    riskPolicy: "Do not invent claims, prices, quotes, or recommendations that are not present in the source.",
    hashtagPolicy: "Use only concise, relevant hashtags when useful."
  };
}

type RuntimeAiProvider = "mock" | "openai" | "gemini" | "custom";

function normalizeAiProvider(value: string | undefined): RuntimeAiProvider {
  return value === "openai" || value === "gemini" || value === "custom" ? value : "mock";
}

function defaultModelForProvider(provider: RuntimeAiProvider): string {
  if (provider === "openai") return "gpt-5.4";
  if (provider === "gemini") return "gemini-2.5-flash";
  return "custom-json-model";
}

function createProvider(env: Env, provider: RuntimeAiProvider, model: string) {
  if (provider === "openai") {
    const apiKey = env.OPENAI_API_KEY ?? env.AI_API_KEY;
    return new OpenAIChatCompletionsProvider({ ...(apiKey === undefined ? {} : { apiKey }), model });
  }
  if (provider === "gemini") {
    const apiKey = env.GEMINI_API_KEY ?? env.AI_API_KEY;
    return new GeminiGenerateContentProvider({ ...(apiKey === undefined ? {} : { apiKey }), model });
  }
  if (provider === "custom") {
    const apiKey = env.CUSTOM_AI_API_KEY ?? env.AI_API_KEY;
    return new CustomJsonAIProvider({ ...(apiKey === undefined ? {} : { apiKey }), model });
  }
  return new MockAIProvider();
}

function readInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim().length === 0) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readNumber(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim().length === 0) return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
