import { ItemsRepository, ReviewActionsRepository } from "@curator/db";
import type { D1DatabaseLike } from "@curator/db";
import type { ParsedTelegramCallback, TelegramReviewAction } from "@curator/telegram";

export type ReviewCallbackResult = {
  itemId: string;
  action: TelegramReviewAction;
  routed: true;
  resultingStatus: "sent_to_review" | "approved" | "cancelled";
  message: string;
};

export async function handleReviewCallback(parsed: ParsedTelegramCallback, db: D1DatabaseLike): Promise<ReviewCallbackResult> {
  const itemsRepository = new ItemsRepository(db);
  const reviewActionsRepository = new ReviewActionsRepository(db);

  const resultingStatus = resolveResultingStatus(parsed.action);
  await reviewActionsRepository.createReviewAction({
    itemId: parsed.itemId,
    reviewerId: parsed.reviewerId,
    action: parsed.action,
    payload: {
      callbackId: parsed.callback.id,
      messageId: parsed.callback.message?.message_id
    }
  });

  if (parsed.action === "send" || parsed.action === "cancel") {
    await itemsRepository.updateStatus(parsed.itemId, resultingStatus);
  }

  return {
    itemId: parsed.itemId,
    action: parsed.action,
    routed: true,
    resultingStatus,
    message: createCallbackMessage(parsed.action)
  };
}

function resolveResultingStatus(action: TelegramReviewAction): ReviewCallbackResult["resultingStatus"] {
  switch (action) {
    case "send":
      return "approved";
    case "cancel":
      return "cancelled";
    case "edit":
    case "status":
      return "sent_to_review";
  }
}

function createCallbackMessage(action: TelegramReviewAction): string {
  switch (action) {
    case "edit":
      return "Edit flow is acknowledged and remains stubbed for Phase 2.";
    case "send":
      return "Send action acknowledged. Final publishing is stubbed for Phase 2.";
    case "cancel":
      return "Cancel action acknowledged.";
    case "status":
      return "Status action acknowledged.";
  }
}
