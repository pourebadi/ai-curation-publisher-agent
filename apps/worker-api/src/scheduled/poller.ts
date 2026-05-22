import { runMockPollOperation, type OperationalPollResult } from "../operations/mock-poll";
import type { Env } from "../types";

export type ScheduledPollResult = OperationalPollResult & {
  scheduledTime: number;
  cron?: string;
};

export async function runScheduledPoll(input: {
  scheduledTime: number;
  cron?: string;
  env: Env;
}): Promise<ScheduledPollResult> {
  const result = await runMockPollOperation({
    env: input.env,
    options: { limit: 2 }
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
    mockMode: result.mockMode,
    totalSources: result.totalSources,
    successfulSources: result.successfulSources,
    failedSources: result.failedSources,
    totalReturned: result.totalReturned,
    totalQueued: result.totalQueued,
    totalErrors: result.totalErrors,
    scheduledTime: result.scheduledTime,
    cron: result.cron
  });
}
