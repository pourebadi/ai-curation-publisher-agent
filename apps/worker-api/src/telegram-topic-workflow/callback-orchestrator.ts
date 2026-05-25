import { TelegramGeneratedOutputsRepository, TelegramPublishQueueRepository, TelegramRoutesRepository } from "@curator/db";
import type { ParsedTelegramOutputCallback, TelegramClient } from "@curator/telegram";
import type { Env } from "../types";

export type TelegramOutputCallbackResult = {
  ok: boolean;
  kind: "output_callback";
  generatedOutputId: string;
  action: ParsedTelegramOutputCallback["action"];
  status?: string;
  publishQueueStatus?: string;
  message: string;
  finalPublishingTriggered: false;
};

export async function handleTelegramOutputCallback(parsed: ParsedTelegramOutputCallback, env: Env, telegramClient?: TelegramClient): Promise<TelegramOutputCallbackResult> {
  const generatedOutputsRepository = new TelegramGeneratedOutputsRepository(env.DB);
  const publishQueueRepository = new TelegramPublishQueueRepository(env.DB);
  const routesRepository = new TelegramRoutesRepository(env.DB);
  const generatedOutput = await generatedOutputsRepository.findById(parsed.token);

  if (!generatedOutput) {
    await telegramClient?.answerCallbackQuery({ callbackQueryId: parsed.callback.id, text: "Output was not found." });
    return {
      ok: false,
      kind: "output_callback",
      generatedOutputId: parsed.token,
      action: parsed.action,
      message: "Telegram generated output was not found.",
      finalPublishingTriggered: false
    };
  }

  if (parsed.action === "status") {
    const queueItem = await publishQueueRepository.findByGeneratedOutputId(generatedOutput.id);
    const message = queueItem ? `Status: ${generatedOutput.status}. Publish queue: ${queueItem.status}.` : `Status: ${generatedOutput.status}. Not queued for final publishing.`;
    await telegramClient?.answerCallbackQuery({ callbackQueryId: parsed.callback.id, text: message });
    return {
      ok: true,
      kind: "output_callback",
      generatedOutputId: generatedOutput.id,
      action: parsed.action,
      status: generatedOutput.status,
      ...(queueItem === null ? {} : { publishQueueStatus: queueItem.status }),
      message,
      finalPublishingTriggered: false
    };
  }

  if (parsed.action === "cancel") {
    if (generatedOutput.status === "published" || generatedOutput.status === "cancelled") {
      const message = `Already ${generatedOutput.status}.`;
      await telegramClient?.answerCallbackQuery({ callbackQueryId: parsed.callback.id, text: message });
      return {
        ok: true,
        kind: "output_callback",
        generatedOutputId: generatedOutput.id,
        action: parsed.action,
        status: generatedOutput.status,
        message,
        finalPublishingTriggered: false
      };
    }

    await generatedOutputsRepository.updateStatus(generatedOutput.id, "cancelled");
    await telegramClient?.answerCallbackQuery({ callbackQueryId: parsed.callback.id, text: "Cancelled this output." });
    return {
      ok: true,
      kind: "output_callback",
      generatedOutputId: generatedOutput.id,
      action: parsed.action,
      status: "cancelled",
      message: "Cancelled this Telegram output only.",
      finalPublishingTriggered: false
    };
  }

  if (generatedOutput.status === "published" || generatedOutput.status === "cancelled") {
    const message = `Already ${generatedOutput.status}.`;
    await telegramClient?.answerCallbackQuery({ callbackQueryId: parsed.callback.id, text: message });
    return {
      ok: true,
      kind: "output_callback",
      generatedOutputId: generatedOutput.id,
      action: parsed.action,
      status: generatedOutput.status,
      message,
      finalPublishingTriggered: false
    };
  }

  const routeOutput = await routesRepository.findOutputById(generatedOutput.routeOutputId);
  if (!routeOutput) {
    await generatedOutputsRepository.updateStatus(generatedOutput.id, "failed", "Route output is missing.");
    await telegramClient?.answerCallbackQuery({ callbackQueryId: parsed.callback.id, text: "Route output is missing." });
    return {
      ok: false,
      kind: "output_callback",
      generatedOutputId: generatedOutput.id,
      action: parsed.action,
      status: "failed",
      message: "Route output is missing; cannot queue final publishing.",
      finalPublishingTriggered: false
    };
  }

  await generatedOutputsRepository.updateStatus(generatedOutput.id, "approved");
  const queueItem = await publishQueueRepository.enqueue({
    itemId: generatedOutput.itemId,
    generatedOutputId: generatedOutput.id,
    routeId: generatedOutput.routeId,
    routeOutputId: generatedOutput.routeOutputId,
    language: generatedOutput.language,
    finalChatId: routeOutput.finalChatId,
    ...(routeOutput.finalThreadId === undefined ? {} : { finalThreadId: routeOutput.finalThreadId })
  });
  await generatedOutputsRepository.updateStatus(generatedOutput.id, "queued_for_publish");
  await telegramClient?.answerCallbackQuery({ callbackQueryId: parsed.callback.id, text: "Queued. Final Telegram publishing is disabled." });

  return {
    ok: true,
    kind: "output_callback",
    generatedOutputId: generatedOutput.id,
    action: parsed.action,
    status: "queued_for_publish",
    publishQueueStatus: queueItem.status,
    message: "Queued. Final Telegram publishing is disabled.",
    finalPublishingTriggered: false
  };
}
