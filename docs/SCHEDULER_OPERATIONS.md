# Scheduler Operations Safeguards

This guide covers Phase 21 scheduler and production operations safeguards.

Phase 21 prepares the system for controlled operations without enabling production scheduler side effects by default.

## Safety posture

Default behavior:

- scheduler disabled
- dry-run mode enabled
- mock providers only
- no final Telegram publishing
- no WordPress publishing
- no real provider calls
- no media processing side effects
- no external monitoring or paid services

The scheduler is intentionally conservative. Turning on a Cloudflare scheduled trigger should not be treated as permission to run real providers or publish content.

## Runtime names

Use these names through runtime configuration only. Do not commit values.

```text
SCHEDULER_ENABLED
SCHEDULER_DRY_RUN
SCHEDULER_MAX_SOURCES_PER_RUN
SCHEDULER_MAX_ITEMS_PER_RUN
SCHEDULER_ALLOW_REAL_PROVIDERS
SCHEDULER_ALLOW_PUBLISHING
MAX_AI_ITEMS_PER_RUN
MAX_PROVIDER_ITEMS_PER_RUN
MAX_PUBLISH_ITEMS_PER_RUN
INTERNAL_API_SECRET
```

## Defaults

When unset, scheduler behavior is:

```text
scheduler enabled: false
dry run: true
max sources per run: 1
max items per run: 2
real providers allowed: false
publishing allowed: false
max AI items per run: 0
max provider items per run: 5
max publish items per run: 0
```

These defaults are designed to prevent accidental large runs, provider spend, or publishing.

## Scheduled handler behavior

The Cloudflare scheduled handler calls the guarded scheduler operation.

If the scheduler is disabled, the scheduled handler returns/logs a structured skipped result:

```text
reason: scheduler_disabled
skipped: true
```

If the scheduler is enabled, Phase 21 still uses mock-safe polling only. It does not use real providers or publish content, even if permissive flags are accidentally set. Permissive flags are reflected as warnings.

## Manual scheduler dry-run route

Route:

```text
POST /internal/scheduler/run
```

Example body:

```json
{
  "dryRun": true,
  "maxSources": 1,
  "maxItems": 1
}
```

When `INTERNAL_API_SECRET` is configured, include the internal route header from your local shell or secret store.

```bash
curl -fsS -X POST "$WORKER_BASE_URL/internal/scheduler/run" \
  -H "content-type: application/json" \
  -H "x-internal-api-secret: $INTERNAL_API_SECRET" \
  -d '{"dryRun":true,"maxSources":1,"maxItems":1}'
```

Manual route behavior:

- protected by internal route auth when configured
- runs mock-safe polling
- does not require scheduler to be enabled
- does not use real providers by default
- does not publish by default
- respects requested source and item limits
- returns a structured scheduler result

## Result shape

Scheduler responses include:

```text
ok
skipped
reason
dryRun
schedulerEnabled
providersMode
realProvidersAllowed
publishingAllowed
maxSources
maxItems
totalSources
totalReturned
totalQueued
totalDuplicates
totalInvalid
totalErrors
warnings
errors
startedAt
finishedAt
```

`totalQueued` remains zero in dry-run mode. Phase 21 does not trigger final publishing.

## Status and readiness

`GET /status` may include:

```text
scheduler.enabled
scheduler.dryRun
scheduler.realProvidersAllowed
scheduler.publishingAllowed
scheduler.maxSourcesPerRun
scheduler.maxItemsPerRun
quotas.maxAiItemsPerRun
quotas.maxProviderItemsPerRun
quotas.maxPublishItemsPerRun
```

`GET /ready` may include the same safe scheduler/quota summary through its config summary.

No secret values should appear in either response.

## Enabling scheduler safely later

Before enabling scheduler for production behavior in a future phase:

1. Confirm mock E2E smoke passes.
2. Confirm `/ready` passes.
3. Keep real providers disabled.
4. Keep publishing disabled.
5. Set conservative source and item limits.
6. Run `POST /internal/scheduler/run` manually.
7. Inspect logs and structured counts.
8. Only then consider enabling scheduled execution.

Phase 21 itself does not enable real provider polling or publishing.

## Disable immediately

To disable scheduler behavior:

1. Disable the scheduler enabled flag.
2. Keep dry-run enabled.
3. Disable real provider access.
4. Disable publishing access.
5. Confirm `/status` reflects disabled scheduler behavior.
6. Confirm scheduled logs show skipped execution.

## Rollback notes

Rollback options:

- revert the PR and redeploy
- disable scheduler flags in runtime configuration
- disable Cloudflare scheduled trigger if a future phase activates one
- return provider mode to mock
- keep publish quotas at zero

## Out of scope

Phase 21 does not implement:

- real provider production rollout
- automatic Firecrawl production polling
- automatic final Telegram publishing
- automatic WordPress publishing
- real media download
- dashboard
- external monitoring or alerting services
- Durable Objects or KV quota system
- Phase 22 behavior
