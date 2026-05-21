import type { Env } from "../types";

export async function handleScheduledPoll(_controller: ScheduledController, env: Env): Promise<void> {
  console.log("Scheduled poller stub invoked", {
    environment: env.ENVIRONMENT ?? "unknown"
  });
}
