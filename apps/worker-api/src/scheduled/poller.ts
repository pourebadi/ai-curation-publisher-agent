import { runScheduledPollOperation, type ScheduledPollOperationResult } from "../operations/scheduled-poll";
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
    cron: controller.cron,
    env
  });

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
    cron: result.cron
  });
}
