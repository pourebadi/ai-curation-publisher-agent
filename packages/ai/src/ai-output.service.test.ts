import { describe, expect, it } from "vitest";
import type { NormalizedPost } from "@curator/core";
import { AIOutputService } from "./ai-output.service";
import { MockAIProvider } from "./mock-ai-provider";
import type { AIProvider, AIProviderRequest, AIProviderResponse } from "./provider";
import { renderTelegramPrompt } from "./prompts";
import { validateTelegramStructuredOutput } from "./telegram-output";

function makePost(overrides: Partial<NormalizedPost> = {}): NormalizedPost {
  return {
    provider: "mock_social_provider",
    platform: "manual",
    sourceType: "web_url",
    sourcePostId: "message-local",
    canonicalUrl: "https://source.local/post",
    text: "Original source text",
    links: ["https://source.local/post"],
    media: [],
    rawPayload: {},
    ...overrides
  };
}

class InvalidOutputProvider implements AIProvider {
  readonly id = "invalid_output_provider";

  async generate(request: AIProviderRequest): Promise<AIProviderResponse> {
    return {
      provider: this.id,
      model: request.model,
      rawText: JSON.stringify({ headline: "Missing required fields" }),
      output: { headline: "Missing required fields" }
    };
  }
}

describe("AI output pipeline", () => {
  it("returns a structured response from the mock AI provider", async () => {
    const provider = new MockAIProvider();
    const prompt = renderTelegramPrompt({ post: makePost() });

    const response = await provider.generate({
      promptId: prompt.promptId,
      promptVersion: prompt.promptVersion,
      target: prompt.target,
      model: prompt.model,
      messages: [
        { role: "system", content: prompt.systemMessage },
        { role: "user", content: prompt.userMessage }
      ],
      temperature: prompt.temperature,
      maxTokens: prompt.maxTokens,
      outputSchemaRef: prompt.outputSchemaRef
    });

    expect(response.provider).toBe("mock_ai_provider");
    expect(response.output).toBeDefined();
    expect(response.inputTokens).toBeGreaterThan(0);
    expect(response.outputTokens).toBeGreaterThan(0);
  });

  it("renders the Telegram prompt with normalized post fields", () => {
    const rendered = renderTelegramPrompt({
      post: makePost({ authorHandle: "curator" }),
      sourceAttributionText: "Source: provided by test"
    });

    expect(rendered.promptId).toBe("telegram_curation_v1");
    expect(rendered.target).toBe("telegram");
    expect(rendered.systemMessage).toContain("Persian Telegram audience");
    expect(rendered.userMessage).toContain("https://source.local/post");
    expect(rendered.userMessage).toContain("curator");
    expect(rendered.userMessage).toContain("Source: provided by test");
  });

  it("validates Telegram structured output", () => {
    const result = validateTelegramStructuredOutput({
      headline: "Headline",
      rewrittenPersianCaption: "کپشن فارسی",
      shortSummary: "Summary",
      language: "fa",
      riskFlags: [],
      relevanceScore: 0.9,
      suggestedHashtags: ["#AI"],
      sourceAttributionText: "Source"
    });

    expect(result.valid).toBe(true);
    expect(result.output?.headline).toBe("Headline");
  });

  it("generates a valid Telegram output through the service", async () => {
    const service = new AIOutputService(new MockAIProvider());

    const result = await service.generateTelegramOutput({
      itemId: "item-local",
      post: makePost()
    });

    expect(result.itemId).toBe("item-local");
    expect(result.target).toBe("telegram");
    expect(result.promptId).toBe("telegram_curation_v1");
    expect(result.output.language).toBe("fa");
    expect(result.inputTokens).toBeGreaterThan(0);
    expect(result.outputTokens).toBeGreaterThan(0);
  });

  it("rejects invalid AI output", async () => {
    const service = new AIOutputService(new InvalidOutputProvider());

    await expect(service.generateTelegramOutput({
      itemId: "item-local",
      post: makePost()
    })).rejects.toThrow("Invalid Telegram AI output");
  });
});
