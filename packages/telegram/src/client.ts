import type { ParsedTelegramMedia, TelegramInlineKeyboardMarkup } from "./index";

export type SendReviewMessageInput = {
  chatId: string;
  messageThreadId?: number;
  text: string;
  replyMarkup: TelegramInlineKeyboardMarkup;
};

export type EditReviewMessageInput = {
  chatId: string;
  messageId: string;
  text: string;
  replyMarkup?: TelegramInlineKeyboardMarkup;
};

export type PublishFinalMessageInput = {
  chatId: string;
  messageThreadId?: number;
  text: string;
  media?: ParsedTelegramMedia[];
};

export type AnswerCallbackQueryInput = {
  callbackQueryId: string;
  text: string;
};

export type TelegramClientMessage = {
  chatId: string;
  messageId: string;
  text: string;
  messageThreadId?: number;
  replyMarkup?: TelegramInlineKeyboardMarkup;
};

export interface TelegramClient {
  sendReviewMessage(input: SendReviewMessageInput): Promise<TelegramClientMessage>;
  editReviewMessage(input: EditReviewMessageInput): Promise<TelegramClientMessage>;
  publishFinalMessage(input: PublishFinalMessageInput): Promise<TelegramClientMessage>;
  answerCallbackQuery(input: AnswerCallbackQueryInput): Promise<void>;
}

export class MockTelegramClient implements TelegramClient {
  readonly sentReviewMessages: TelegramClientMessage[] = [];
  readonly editedReviewMessages: TelegramClientMessage[] = [];
  readonly publishedFinalMessages: TelegramClientMessage[] = [];
  readonly answeredCallbacks: AnswerCallbackQueryInput[] = [];

  constructor(private nextMessageNumber = 1) {}

  async sendReviewMessage(input: SendReviewMessageInput): Promise<TelegramClientMessage> {
    const message: TelegramClientMessage = {
      chatId: input.chatId,
      messageId: `mock_telegram_review_${this.nextMessageNumber}`,
      text: input.text,
      ...(input.messageThreadId === undefined ? {} : { messageThreadId: input.messageThreadId }),
      replyMarkup: input.replyMarkup
    };
    this.nextMessageNumber += 1;
    this.sentReviewMessages.push(message);
    return message;
  }

  async editReviewMessage(input: EditReviewMessageInput): Promise<TelegramClientMessage> {
    const message: TelegramClientMessage = {
      chatId: input.chatId,
      messageId: input.messageId,
      text: input.text,
      ...(input.replyMarkup === undefined ? {} : { replyMarkup: input.replyMarkup })
    };
    this.editedReviewMessages.push(message);
    return message;
  }

  async publishFinalMessage(input: PublishFinalMessageInput): Promise<TelegramClientMessage> {
    const message: TelegramClientMessage = {
      chatId: input.chatId,
      messageId: `mock_telegram_final_${this.nextMessageNumber}`,
      text: input.text,
      ...(input.messageThreadId === undefined ? {} : { messageThreadId: input.messageThreadId })
    };
    this.nextMessageNumber += 1;
    this.publishedFinalMessages.push(message);
    return message;
  }

  async answerCallbackQuery(input: AnswerCallbackQueryInput): Promise<void> {
    this.answeredCallbacks.push(input);
  }
}
