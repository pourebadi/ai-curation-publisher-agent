import { describe, expect, it, vi } from "vitest";
import { buildReviewInlineKeyboard } from "./index";
import { RealTelegramClient, TelegramClientError } from "./real-telegram-client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

describe("RealTelegramClient", () => {
  it("builds sendMessage request using an injected fetch implementation", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      ok: true,
      result: {
        message_id: 42,
        chat: { id: "review-chat" },
        text: "Review text"
      }
    })) as unknown as typeof fetch;
    const client = new RealTelegramClient({
      botToken: "configured-token",
      fetchImpl,
      apiBaseUrl: "https://telegram.local"
    });

    const message = await client.sendReviewMessage({
      chatId: "review-chat",
      text: "Review text",
      replyMarkup: buildReviewInlineKeyboard("item_1")
    });

    expect(message).toMatchObject({
      chatId: "review-chat",
      messageId: "42",
      text: "Review text"
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0] ?? [];
    expect(url).toBe("https://telegram.local/botconfigured-token/sendMessage");
    expect(init).toMatchObject({ method: "POST" });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      chat_id: "review-chat",
      text: "Review text",
      disable_web_page_preview: true
    });
  });

  it("reports missing credentials without calling fetch", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const client = new RealTelegramClient({ fetchImpl });

    await expect(client.sendReviewMessage({
      chatId: "review-chat",
      text: "Review text",
      replyMarkup: buildReviewInlineKeyboard("item_1")
    })).rejects.toMatchObject({
      name: "TelegramClientError",
      category: "missing_credentials"
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not expose the bot token in API error messages", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      ok: false,
      description: "remote failure"
    }, 401)) as unknown as typeof fetch;
    const client = new RealTelegramClient({
      botToken: "configured-token",
      fetchImpl,
      apiBaseUrl: "https://telegram.local"
    });

    await expect(client.sendReviewMessage({
      chatId: "review-chat",
      text: "Review text",
      replyMarkup: buildReviewInlineKeyboard("item_1")
    })).rejects.toBeInstanceOf(TelegramClientError);

    await expect(client.sendReviewMessage({
      chatId: "review-chat",
      text: "Review text",
      replyMarkup: buildReviewInlineKeyboard("item_1")
    })).rejects.toMatchObject({
      category: "telegram_api_error",
      message: "Telegram Bot API returned an error."
    });

    try {
      await client.sendReviewMessage({
        chatId: "review-chat",
        text: "Review text",
        replyMarkup: buildReviewInlineKeyboard("item_1")
      });
    } catch (error) {
      expect(String((error as Error).message)).not.toContain("configured-token");
    }
  });

  it("classifies invalid JSON responses", async () => {
    const fetchImpl = vi.fn(async () => new Response("not-json", { status: 200 })) as unknown as typeof fetch;
    const client = new RealTelegramClient({
      botToken: "configured-token",
      fetchImpl,
      apiBaseUrl: "https://telegram.local"
    });

    await expect(client.sendReviewMessage({
      chatId: "review-chat",
      text: "Review text",
      replyMarkup: buildReviewInlineKeyboard("item_1")
    })).rejects.toMatchObject({
      category: "invalid_response"
    });
  });

  it("does not enable real final publishing through this client", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const client = new RealTelegramClient({
      botToken: "configured-token",
      fetchImpl,
      apiBaseUrl: "https://telegram.local"
    });

    await expect(client.publishFinalMessage({
      chatId: "final-chat",
      text: "Final text"
    })).rejects.toMatchObject({
      category: "telegram_api_error",
      message: "Real final Telegram publishing is not enabled by this client path."
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
