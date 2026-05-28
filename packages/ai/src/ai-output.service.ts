import type { NormalizedPost } from "@curator/core";
import { MockAIProvider } from "./mock-ai-provider";
import type { AIProvider, AIProviderResponse } from "./provider";
import { renderTelegramPrompt, type PromptDefinition } from "./prompts";
import { parseTelegramStructuredOutput, validateTelegramStructuredOutput, type TelegramStructuredOutput } from "./telegram-output";

export type GenerateTelegramOutputInput = {
  itemId: string;
  post: NormalizedPost;
  sourceAttributionText?: string;
  prompt?: PromptDefinition;
  templateValues?: Record<string, string>;
};

export type GenerateTelegramOutputResult = {
  itemId: string;
  target: "telegram";
  promptId: string;
  promptVersion: string;
  model: string;
  output: TelegramStructuredOutput;
  providerResponse: AIProviderResponse;
  inputTokens?: number;
  outputTokens?: number;
};

export class AIOutputService {
  constructor(private readonly provider: AIProvider = new MockAIProvider()) {}

  async generateTelegramOutput(input: GenerateTelegramOutputInput): Promise<GenerateTelegramOutputResult> {
    const renderedPrompt = renderTelegramPrompt({
      post: input.post,
      ...(input.sourceAttributionText === undefined ? {} : { sourceAttributionText: input.sourceAttributionText }),
      ...(input.templateValues === undefined ? {} : { templateValues: input.templateValues })
    }, input.prompt);

    const providerResponse = await this.provider.generate({
      promptId: renderedPrompt.promptId,
      promptVersion: renderedPrompt.promptVersion,
      target: renderedPrompt.target,
      model: renderedPrompt.model,
      messages: [
        { role: "system", content: renderedPrompt.systemMessage },
        { role: "user", content: renderedPrompt.userMessage }
      ],
      temperature: renderedPrompt.temperature,
      maxTokens: renderedPrompt.maxTokens,
      outputSchemaRef: renderedPrompt.outputSchemaRef
    });

    const validation = providerResponse.output === undefined
      ? parseTelegramStructuredOutput(providerResponse.rawText)
      : validateTelegramStructuredOutput(providerResponse.output);

    const output = validation.valid && validation.output !== undefined
      ? validation.output
      : buildSafeTelegramOutputFallback(input, providerResponse.rawText, validation.errors);

    return {
      itemId: input.itemId,
      target: "telegram",
      promptId: renderedPrompt.promptId,
      promptVersion: renderedPrompt.promptVersion,
      model: providerResponse.model,
      output,
      providerResponse,
      ...(providerResponse.inputTokens === undefined ? {} : { inputTokens: providerResponse.inputTokens }),
      ...(providerResponse.outputTokens === undefined ? {} : { outputTokens: providerResponse.outputTokens })
    };
  }
}

function buildSafeTelegramOutputFallback(input: GenerateTelegramOutputInput, rawText: string, errors: string[]): TelegramStructuredOutput {
  const sourceText = input.post.text?.trim() || rawText.trim() || "متن منبع قابل استخراج نبود.";
  const caption = cleanFallbackCaption(sourceText);
  return {
    headline: summarizeHeadline(caption),
    rewrittenPersianCaption: caption,
    shortSummary: summarizeHeadline(caption),
    language: input.templateValues?.language ?? "fa",
    riskFlags: ["ai_json_repair", ...(errors.length > 0 ? ["needs_review"] : [])],
    relevanceScore: 0.3,
    suggestedHashtags: [],
    sourceAttributionText: ""
  };
}

function cleanFallbackCaption(value: string): string {
  return value
    .replace(/```[a-z]*|```/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1800) || "متن منبع قابل استخراج نبود.";
}

function summarizeHeadline(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 90) return trimmed;
  return `${trimmed.slice(0, 89).trimEnd()}…`;
}
