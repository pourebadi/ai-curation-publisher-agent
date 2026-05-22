import { ItemsRepository, ReviewActionsRepository } from "@curator/db";
import type { D1DatabaseLike } from "@curator/db";
import type { ItemStatus } from "@curator/core";
import type { ParsedTelegramCallback, TelegramReviewAction } from "@curator/telegram";

export type ReviewCallbackResult = {
  itemId: string;
  action: TelegramReviewAction;
  routed: true;
  resultingStatus: "sent_to_review" | "approved" | "cancelled";
  statusResponse: {
    itemId: string;
    action: TelegramReviewAction;
    status: "sent_to_review" | "approved" | "cancelled";
    message: string;
    finalPublishingTriggered: false;
    editStubbed: boolean;
  };
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
      messageId: parsed.callback.message?.message_id,
      finalPublishingTriggered: false
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
    statusResponse: {
      itemId: parsed.itemId,
      action: parsed.action,
      status: resultingStatus,
      message: createCallbackMessage(parsed.action),
      finalPublishingTriggered: false,
      editStubbed: parsed.action === "edit"
    }
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
      return "Edit action acknowledged. Editing remains stubbed for Phase 5.";
    case "send":
      return "Send action approved the item. Final publishing is not triggered in Phase 5.";
    case "cancel":
      return "Cancel action cancelled the item.";
    case "status":
      return "Status action returned current review routing state.";
  }
}
