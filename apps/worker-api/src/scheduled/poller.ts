import { runScheduledPollOperation, type ScheduledPollOperationResult } from "../operations/scheduled-poll";
import { runTelegramPublishDueOperation } from "../operations/telegram-publish-due";
import { getEffectiveEnv } from "../admin-config/service";
import type { Env } from "../types";

export type ScheduledPollResult = ScheduledPollOperationResult & {
  scheduledTime: number;
  cron?: string;
};

export async function runScheduledPoll(input: {
  scheduledTime: number;
  cron?: string;
  env: Env;
}): Promise<ScheduledPollResult> {
  const result = await runScheduledPollOperation(input.env, {
    mode: "scheduled",
    respectEnabled: true
  });

  return {
    ...result,
    scheduledTime: input.scheduledTime,
    ...(input.cron === undefined ? {} : { cron: input.cron })
  };
}

export async function handleScheduledPoll(controller: ScheduledController, env: Env): Promise<void> {
  const result = await runScheduledPoll({
    scheduledTime: controller.scheduledTime,
    ...(controller.cron === undefined ? {} : { cron: controller.cron }),
    env
  });

  const effectiveEnv = await getEffectiveEnv(env);
  const telegramPublishSchedulerEnabled = (effectiveEnv as Env & { TELEGRAM_PUBLISH_SCHEDULER_ENABLED?: string }).TELEGRAM_PUBLISH_SCHEDULER_ENABLED === "true";
  const publishResult = telegramPublishSchedulerEnabled ? await runTelegramPublishDueOperation(effectiveEnv) : undefined;

  console.log("Scheduled poll completed", {
    ok: result.ok,
    skipped: result.skipped,
    reason: result.reason,
    dryRun: result.dryRun,
    schedulerEnabled: result.schedulerEnabled,
    providersMode: result.providersMode,
    realProvidersAllowed: result.realProvidersAllowed,
    publishingAllowed: result.publishingAllowed,
    totalSources: result.totalSources,
    totalReturned: result.totalReturned,
    totalQueued: result.totalQueued,
    totalDuplicates: result.totalDuplicates,
    totalInvalid: result.totalInvalid,
    totalErrors: result.totalErrors,
    scheduledTime: result.scheduledTime,
    cron: result.cron,
    telegramPublishSchedulerEnabled,
    telegramPublishDueCount: publishResult?.dueCount ?? 0,
    telegramPublishPublishedCount: publishResult?.publishedCount ?? 0,
    telegramPublishFailedCount: publishResult?.failedCount ?? 0
  });
}
