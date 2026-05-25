import type { TelegramLocalizedOutput, TelegramRouteOutputRecord, TelegramRouteRecord } from "@curator/db";
import type { NormalizedPost } from "@curator/core";

export type BuildLocalizedTelegramOutputInput = {
  route: TelegramRouteRecord;
  routeOutput: TelegramRouteOutputRecord;
  post: NormalizedPost;
  sourceAttributionText: string;
};

export function buildMockLocalizedTelegramOutput(input: BuildLocalizedTelegramOutputInput): TelegramLocalizedOutput {
  const sourceText = input.post.text?.trim() || "Source content has no text caption.";
  const excerpt = sourceText.length > 180 ? `${sourceText.slice(0, 179)}…` : sourceText;
  const language = input.routeOutput.language;
  return {
    language,
    headline: `${input.route.category} update (${language})`,
    caption: `[${language}] ${excerpt}\n\n${input.sourceAttributionText}`,
    summary: `Mock ${language} summary for ${input.route.category}.`,
    hashtags: [`#${input.route.category}`, `#${language}`],
    riskFlags: [],
    relevanceScore: 0.82,
    sourceAttributionText: input.sourceAttributionText
  };
}
