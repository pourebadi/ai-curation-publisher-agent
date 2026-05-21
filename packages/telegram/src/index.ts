export const TELEGRAM_REVIEW_ACTIONS = ["edit", "send", "cancel", "status"] as const;
export type TelegramReviewAction = typeof TELEGRAM_REVIEW_ACTIONS[number];

export type TelegramWebhookAck = {
  ok: true;
  receivedUpdateId?: number;
  kind?: ParsedTelegramUpdate["kind"];
  itemId?: string;
  callbackAction?: TelegramReviewAction;
};

export type TelegramUser = {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
};

export type TelegramChat = {
  id: number | string;
  type?: string;
  title?: string;
  username?: string;
};

export type TelegramMessageEntity = {
  type: string;
  offset: number;
  length: number;
  url?: string;
};

export type TelegramMessage = {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date?: number;
  text?: string;
  caption?: string;
  entities?: TelegramMessageEntity[];
  caption_entities?: TelegramMessageEntity[];
};

export type TelegramCallbackMessage = {
  message_id: number;
  chat: TelegramChat;
};

export type TelegramCallbackQuery = {
  id: string;
  from: TelegramUser;
  message?: TelegramCallbackMessage;
  data?: string;
};

export type TelegramUpdate = {
  update_id?: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

export type ParsedManualTelegramMessage = {
  kind: "manual_message";
  updateId?: number;
  message: TelegramMessage;
  reviewerId: string;
  text: string;
  urls: string[];
};

export type ParsedTelegramCallback = {
  kind: "callback";
  updateId?: number;
  callback: TelegramCallbackQuery;
  reviewerId: string;
  itemId: string;
  action: TelegramReviewAction;
};

export type IgnoredTelegramUpdate = {
  kind: "ignored";
  updateId?: number;
  reason: string;
};

export type ParsedTelegramUpdate = ParsedManualTelegramMessage | ParsedTelegramCallback | IgnoredTelegramUpdate;

export type TelegramInlineKeyboardButton = {
  text: string;
  callback_data: string;
};

export type TelegramInlineKeyboardMarkup = {
  inline_keyboard: TelegramInlineKeyboardButton[][];
};

export type TelegramReviewDraft = {
  text: string;
  reply_markup: TelegramInlineKeyboardMarkup;
};

export type BuildTelegramReviewDraftInput = {
  itemId: string;
  caption: string;
  sourceUrl: string;
  status: string;
  links: string[];
};

export function parseAllowedReviewerIds(raw: string | undefined): Set<string> {
  if (!raw) {
    return new Set();
  }

  return new Set(raw.split(",").map((value) => value.trim()).filter((value) => value.length > 0));
}

export function isReviewerAllowed(reviewerId: string, allowedReviewerIds: Set<string>): boolean {
  if (allowedReviewerIds.size === 0) {
    return true;
  }

  return allowedReviewerIds.has(reviewerId);
}

export function getTelegramMessageText(message: TelegramMessage): string {
  return (message.text ?? message.caption ?? "").trim();
}

export function extractUrls(text: string): string[] {
  const matches = text.matchAll(/https?:\/\/[^\s<>()]+/gi);
  const urls = Array.from(matches, (match) => match[0].replace(/[),.;:!?]+$/, ""));
  return Array.from(new Set(urls));
}

export function parseTelegramUpdate(update: TelegramUpdate): ParsedTelegramUpdate {
  const updateFields: Pick<ParsedTelegramUpdate, "updateId"> = update.update_id === undefined ? {} : { updateId: update.update_id };

  if (update.callback_query) {
    const parsedCallback = parseReviewCallbackData(update.callback_query.data ?? "");
    if (!parsedCallback) {
      return { kind: "ignored", ...updateFields, reason: "unsupported_callback_data" };
    }

    return {
      kind: "callback",
      ...updateFields,
      callback: update.callback_query,
      reviewerId: String(update.callback_query.from.id),
      action: parsedCallback.action,
      itemId: parsedCallback.itemId
    };
  }

  const message = update.message ?? update.edited_message;
  if (!message) {
    return { kind: "ignored", ...updateFields, reason: "unsupported_update" };
  }

  const text = getTelegramMessageText(message);
  if (!text) {
    return { kind: "ignored", ...updateFields, reason: "empty_message" };
  }

  if (!message.from) {
    return { kind: "ignored", ...updateFields, reason: "missing_sender" };
  }

  return {
    kind: "manual_message",
    ...updateFields,
    message,
    reviewerId: String(message.from.id),
    text,
    urls: extractUrls(text)
  };
}

export function buildReviewCallbackData(action: TelegramReviewAction, itemId: string): string {
  return `review:${action}:${itemId}`;
}

export function parseReviewCallbackData(data: string): { action: TelegramReviewAction; itemId: string } | null {
  const [namespace, action, ...itemIdParts] = data.split(":");
  const itemId = itemIdParts.join(":");

  if (namespace !== "review" || !isTelegramReviewAction(action) || itemId.length === 0) {
    return null;
  }

  return { action, itemId };
}

export function isTelegramReviewAction(value: string | undefined): value is TelegramReviewAction {
  return TELEGRAM_REVIEW_ACTIONS.includes(value as TelegramReviewAction);
}

export function buildReviewInlineKeyboard(itemId: string): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: "Edit", callback_data: buildReviewCallbackData("edit", itemId) },
        { text: "Send", callback_data: buildReviewCallbackData("send", itemId) }
      ],
      [
        { text: "Cancel", callback_data: buildReviewCallbackData("cancel", itemId) },
        { text: "Status", callback_data: buildReviewCallbackData("status", itemId) }
      ]
    ]
  };
}

export function buildTelegramReviewDraft(input: BuildTelegramReviewDraftInput): TelegramReviewDraft {
  const links = input.links.length > 0 ? input.links.map((link) => `- ${link}`).join("\n") : "- none";

  return {
    text: [
      "Manual review draft",
      "",
      `Item: ${input.itemId}`,
      `Status: ${input.status}`,
      `Source: ${input.sourceUrl}`,
      "",
      "Caption:",
      input.caption,
      "",
      "Links:",
      links
    ].join("\n"),
    reply_markup: buildReviewInlineKeyboard(input.itemId)
  };
}
