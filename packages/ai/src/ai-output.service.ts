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
      ...(input.sourceAttributionText === undefined ? {} : { sourceAttributionText: input.sourceAttributionText })
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

    if (!validation.valid || validation.output === undefined) {
      throw new Error(`Invalid Telegram AI output: ${validation.errors.join("; ")}`);
    }

    return {
      itemId: input.itemId,
      target: "telegram",
      promptId: renderedPrompt.promptId,
      promptVersion: renderedPrompt.promptVersion,
      model: providerResponse.model,
      output: validation.output,
      providerResponse,
      ...(providerResponse.inputTokens === undefined ? {} : { inputTokens: providerResponse.inputTokens }),
      ...(providerResponse.outputTokens === undefined ? {} : { outputTokens: providerResponse.outputTokens })
    };
  }
}
