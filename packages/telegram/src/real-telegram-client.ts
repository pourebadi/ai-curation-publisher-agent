import type {
  AnswerCallbackQueryInput,
  EditReviewMessageInput,
  PublishFinalMessageInput,
  SendReviewMessageInput,
  TelegramClient,
  TelegramClientMessage
} from "./client";

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
      text: input.text,
      reply_markup: input.replyMarkup,
      disable_web_page_preview: true
    });

    return toTelegramClientMessage(result, input.chatId, input.text, input.replyMarkup);
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

  async publishFinalMessage(_input: PublishFinalMessageInput): Promise<TelegramClientMessage> {
    throw new TelegramClientError({
      category: "telegram_api_error",
      message: "Real final Telegram publishing is not enabled by this client path."
    });
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
        message: "Telegram Bot API returned an error.",
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

function toTelegramClientMessage(
  result: TelegramApiMessage,
  fallbackChatId: string,
  text: string,
  replyMarkup: TelegramClientMessage["replyMarkup"]
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
    text: typeof result.text === "string" ? result.text : text,
    ...(replyMarkup === undefined ? {} : { replyMarkup })
  };
}
