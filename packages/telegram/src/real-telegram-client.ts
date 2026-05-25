import type {
  AnswerCallbackQueryInput,
  EditReviewMessageInput,
  PublishFinalMessageInput,
  SendReviewMessageInput,
  TelegramClient,
  TelegramClientMessage
} from "./client";
import type { ParsedTelegramMedia } from "./index";

export type TelegramClientErrorCategory =
  | "missing_credentials"
  | "telegram_api_error"
  | "network_error"
  | "invalid_response";

export type TelegramClientErrorDetails = {
  category: TelegramClientErrorCategory;
  message: string;
  statusCode?: number;
  cause?: unknown;
};

export class TelegramClientError extends Error {
  readonly category: TelegramClientErrorCategory;
  readonly statusCode: number | undefined;
  readonly cause: unknown;

  constructor(details: TelegramClientErrorDetails) {
    super(details.message);
    this.name = "TelegramClientError";
    this.category = details.category;
    this.statusCode = details.statusCode;
    this.cause = details.cause;
  }
}

export type TelegramFetch = typeof fetch;

export type RealTelegramClientOptions = {
  botToken?: string;
  fetchImpl?: TelegramFetch;
  apiBaseUrl?: string;
};

type TelegramApiResponse = {
  ok?: unknown;
  description?: unknown;
  result?: unknown;
};

type TelegramApiMessage = {
  message_id?: unknown;
  chat?: {
    id?: unknown;
  };
  text?: unknown;
  caption?: unknown;
};

export class RealTelegramClient implements TelegramClient {
  private readonly botToken: string | undefined;
  private readonly fetchImpl: TelegramFetch;
  private readonly apiBaseUrl: string;

  constructor(options: RealTelegramClientOptions) {
    this.botToken = options.botToken?.trim();
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.apiBaseUrl = options.apiBaseUrl ?? "https://api.telegram.org";
  }

  async sendReviewMessage(input: SendReviewMessageInput): Promise<TelegramClientMessage> {
    const result = await this.callTelegramApi<TelegramApiMessage>("sendMessage", {
      chat_id: input.chatId,
      ...(input.messageThreadId === undefined ? {} : { message_thread_id: input.messageThreadId }),
      text: input.text,
      reply_markup: input.replyMarkup,
      disable_web_page_preview: true
    });

    return toTelegramClientMessage(result, input.chatId, input.text, input.replyMarkup, input.messageThreadId);
  }

  async editReviewMessage(input: EditReviewMessageInput): Promise<TelegramClientMessage> {
    const result = await this.callTelegramApi<TelegramApiMessage>("editMessageText", {
      chat_id: input.chatId,
      message_id: input.messageId,
      text: input.text,
      ...(input.replyMarkup === undefined ? {} : { reply_markup: input.replyMarkup }),
      disable_web_page_preview: true
    });

    return toTelegramClientMessage(result, input.chatId, input.text, input.replyMarkup);
  }

  async publishFinalMessage(input: PublishFinalMessageInput): Promise<TelegramClientMessage> {
    const firstMedia = input.media?.[0];
    if (!firstMedia) {
      const result = await this.callTelegramApi<TelegramApiMessage>("sendMessage", {
        chat_id: input.chatId,
        ...(input.messageThreadId === undefined ? {} : { message_thread_id: input.messageThreadId }),
        text: input.text,
        disable_web_page_preview: true
      });
      return toTelegramClientMessage(result, input.chatId, input.text, undefined, input.messageThreadId);
    }

    const method = telegramMethodForMedia(firstMedia);
    const mediaField = telegramMediaFieldForMedia(firstMedia);
    const result = await this.callTelegramApi<TelegramApiMessage>(method, {
      chat_id: input.chatId,
      ...(input.messageThreadId === undefined ? {} : { message_thread_id: input.messageThreadId }),
      [mediaField]: firstMedia.fileId,
      caption: input.text
    });

    return toTelegramClientMessage(result, input.chatId, input.text, undefined, input.messageThreadId);
  }

  async answerCallbackQuery(input: AnswerCallbackQueryInput): Promise<void> {
    await this.callTelegramApi<unknown>("answerCallbackQuery", {
      callback_query_id: input.callbackQueryId,
      text: input.text
    });
  }

  private async callTelegramApi<T>(method: string, body: Record<string, unknown>): Promise<T> {
    if (!this.botToken) {
      throw new TelegramClientError({
        category: "missing_credentials",
        message: "Telegram bot token is not configured."
      });
    }

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.apiBaseUrl}/bot${this.botToken}/${method}`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(body)
      });
    } catch (error) {
      throw new TelegramClientError({
        category: "network_error",
        message: "Telegram Bot API request failed before receiving a response.",
        cause: error
      });
    }

    if (!isResponseLike(response)) {
      throw new TelegramClientError({
        category: "invalid_response",
        message: "Telegram Bot API returned an invalid response object."
      });
    }

    let payload: TelegramApiResponse;
    try {
      payload = await response.json() as TelegramApiResponse;
    } catch (error) {
      throw new TelegramClientError({
        category: "invalid_response",
        message: "Telegram Bot API returned invalid JSON.",
        statusCode: response.status,
        cause: error
      });
    }

    if (!response.ok || payload.ok !== true) {
      throw new TelegramClientError({
        category: "telegram_api_error",
        message: redactTelegramApiError(payload.description),
        statusCode: response.status
      });
    }

    if (payload.result === undefined || payload.result === null) {
      throw new TelegramClientError({
        category: "invalid_response",
        message: "Telegram Bot API response did not include a result.",
        statusCode: response.status
      });
    }

    return payload.result as T;
  }
}

function telegramMethodForMedia(media: ParsedTelegramMedia): "sendPhoto" | "sendVideo" | "sendDocument" {
  if (media.kind === "photo") return "sendPhoto";
  if (media.kind === "video" || media.kind === "animation") return "sendVideo";
  return "sendDocument";
}

function telegramMediaFieldForMedia(media: ParsedTelegramMedia): "photo" | "video" | "document" {
  if (media.kind === "photo") return "photo";
  if (media.kind === "video" || media.kind === "animation") return "video";
  return "document";
}

export function redactTelegramApiError(_description: unknown): string {
  return "Telegram Bot API returned an error.";
}

function isResponseLike(value: unknown): value is Response {
  return typeof value === "object"
    && value !== null
    && "ok" in value
    && "status" in value
    && typeof (value as { json?: unknown }).json === "function";
}

function toTelegramClientMessage(
  result: TelegramApiMessage,
  fallbackChatId: string,
  text: string,
  replyMarkup: TelegramClientMessage["replyMarkup"],
  messageThreadId?: number
): TelegramClientMessage {
  if (typeof result.message_id !== "number") {
    throw new TelegramClientError({
      category: "invalid_response",
      message: "Telegram Bot API response did not include a numeric message id."
    });
  }

  const chatId = result.chat?.id === undefined ? fallbackChatId : String(result.chat.id);

  return {
    chatId,
    messageId: String(result.message_id),
    text: typeof result.text === "string" ? result.text : typeof result.caption === "string" ? result.caption : text,
    ...(messageThreadId === undefined ? {} : { messageThreadId }),
    ...(replyMarkup === undefined ? {} : { replyMarkup })
  };
}
