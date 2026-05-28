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
  const language = normalizeTargetLanguage(input.templateValues?.language);
  const providerUnavailable = errors.some((error) => isProviderUnavailableText(error))
    || isProviderUnavailableText(rawText);

  const copy = buildLanguageAwareFallbackCopy(language, providerUnavailable);

  return {
    headline: copy.headline,
    rewrittenPersianCaption: copy.caption,
    shortSummary: copy.summary,
    language,
    riskFlags: [providerUnavailable ? "ai_unavailable" : "ai_json_repair", "needs_retry", "needs_review"],
    relevanceScore: 0,
    suggestedHashtags: [],
    sourceAttributionText: ""
  };
}

function normalizeTargetLanguage(language: unknown): string {
  if (typeof language !== "string" || language.trim().length === 0) return "fa";
  return language.trim().toLowerCase();
}

function isProviderUnavailableText(value: string): boolean {
  return /503|UNAVAILABLE|high demand|temporarily|overloaded|rate limit|rate-limited|timeout/i.test(value);
}

function buildLanguageAwareFallbackCopy(language: string, providerUnavailable: boolean): { headline: string; caption: string; summary: string } {
  const retryReason = providerUnavailable ? "provider_unavailable" : "invalid_ai_output";

  const dictionary: Record<string, { headline: string; unavailable: string; invalid: string; summary: string }> = {
    fa: {
      headline: "نیازمند پردازش دوباره",
      unavailable: "ترجمه خودکار این پست در این اجرا انجام نشد، چون سرویس هوش مصنوعی موقتاً در دسترس نبود. لطفاً چند دقیقه دیگر دوباره پردازش کنید.",
      invalid: "تولید کپشن این پست کامل نشد. لطفاً این مورد را دوباره پردازش کنید یا خروجی AI را در داشبورد بررسی کنید.",
      summary: "این مورد نیازمند پردازش دوباره است."
    },
    en: {
      headline: "Needs reprocessing",
      unavailable: "Automatic rewriting did not complete because the AI provider was temporarily unavailable. Please retry this item in a few minutes.",
      invalid: "The caption could not be generated cleanly. Please retry this item or review the AI output in the dashboard.",
      summary: "This item needs to be reprocessed."
    },
    ar: {
      headline: "يحتاج إلى إعادة المعالجة",
      unavailable: "لم تكتمل المعالجة التلقائية لهذا المنشور لأن خدمة الذكاء الاصطناعي غير متاحة مؤقتاً. يرجى إعادة المحاولة بعد بضع دقائق.",
      invalid: "لم يتم إنشاء التعليق بشكل صحيح. يرجى إعادة معالجة هذا العنصر أو مراجعة مخرجات الذكاء الاصطناعي في لوحة التحكم.",
      summary: "هذا العنصر يحتاج إلى إعادة المعالجة."
    },
    tr: {
      headline: "Yeniden işlenmesi gerekiyor",
      unavailable: "AI sağlayıcısı geçici olarak kullanılamadığı için otomatik metin oluşturma tamamlanamadı. Lütfen birkaç dakika sonra tekrar deneyin.",
      invalid: "Başlık/metin düzgün üretilemedi. Lütfen bu öğeyi yeniden işleyin veya AI çıktısını panelden kontrol edin.",
      summary: "Bu öğenin yeniden işlenmesi gerekiyor."
    }
  };

  const copy = dictionary[language] ?? dictionary.en!;
  return {
    headline: copy.headline,
    caption: retryReason === "provider_unavailable" ? copy.unavailable : copy.invalid,
    summary: copy.summary
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
