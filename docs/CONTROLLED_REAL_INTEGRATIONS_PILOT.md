# Controlled Real Integrations Pilot

Phase 22 adds a manual, operator-driven pilot workflow for checking real integration readiness without launching production automation.

The pilot coordinates existing dry-run capabilities for:

- Firecrawl/Web sandbox fetch
- Telegram review-channel dry run
- WordPress draft dry run

It does not enable automatic scheduling, production provider rollout, final Telegram publishing, public WordPress publishing, media processing, dashboard behavior, or launch automation.

## Safety posture

Default behavior:

- no integration step runs unless explicitly requested
- empty body returns readiness/configuration summary only
- scheduler is not started
- final Telegram publishing is not triggered
- public WordPress publishing is not triggered
- downstream ingest, enqueue, AI, media, and publish side effects are not triggered
- tests use mocks only

The route is inspect-only orchestration. It is meant to help an operator verify readiness step by step.

## Required runtime names

Configure values through local `.dev.vars`, Cloudflare Worker secrets, or deployment environment settings. Do not commit values.

```text
INTERNAL_API_SECRET
PROVIDERS_MODE
ENABLE_FIRECRAWL_PROVIDER
FIRECRAWL_API_KEY
TELEGRAM_BOT_TOKEN
TELEGRAM_WEBHOOK_SECRET
TELEGRAM_REVIEW_CHAT_ID
TELEGRAM_REAL_REVIEW_ENABLED
WORDPRESS_BASE_URL
WORDPRESS_USERNAME
WORDPRESS_APPLICATION_PASSWORD
WORDPRESS_REAL_DRY_RUN_ENABLED
```

Use names only in docs, PRs, and checklists. Do not paste runtime values into commits, comments, logs, or screenshots.

## Route

```text
POST /internal/pilot/real-integrations
```

When `INTERNAL_API_SECRET` is configured, include the internal route header from your local shell or secret store.

```bash
curl -fsS -X POST "$WORKER_BASE_URL/internal/pilot/real-integrations" \
  -H "content-type: application/json" \
  -H "x-internal-api-secret: $INTERNAL_API_SECRET" \
  -d '{}'
```

## Input

All integration steps are opt-in.

```json
{
  "runFirecrawl": false,
  "runTelegramReview": false,
  "runWordPressDraft": false,
  "firecrawlUrl": "https://example.com/article",
  "telegramText": "Dry-run review text",
  "wordpressTitle": "Dry-run title",
  "wordpressContent": "Dry-run content",
  "sourceUrl": "https://example.com/source"
}
```

Empty body as `{}` returns readiness/config summary only.

## Result shape

The combined result includes:

```text
ok
mode
inspectOnly
readiness
safety
firecrawl
telegramReview
wordpressDraft
skipped
warnings
errors
startedAt
finishedAt
```

Each step reports whether it was requested, skipped, configured, enabled, and successful.

## Step 1: readiness-only pilot

Run first:

```bash
curl -fsS -X POST "$WORKER_BASE_URL/internal/pilot/real-integrations" \
  -H "content-type: application/json" \
  -H "x-internal-api-secret: $INTERNAL_API_SECRET" \
  -d '{}'
```

Expected behavior:

- no Firecrawl call
- no Telegram call
- no WordPress call
- readiness summary returned
- skipped list includes all three integrations
- no secrets exposed

## Step 2: Firecrawl pilot

Run only after Firecrawl sandbox configuration has been intentionally enabled.

```bash
curl -fsS -X POST "$WORKER_BASE_URL/internal/pilot/real-integrations" \
  -H "content-type: application/json" \
  -H "x-internal-api-secret: $INTERNAL_API_SECRET" \
  -d '{"runFirecrawl":true,"firecrawlUrl":"https://example.com/article"}'
```

Expected behavior:

- Firecrawl sandbox fetch runs only if explicitly requested
- result includes normalized web post data or a typed failure
- no downstream ingest or queueing
- no Telegram or WordPress action
- no scheduler activation

## Step 3: Telegram review pilot

Run only after Telegram real review dry-run mode is intentionally enabled and review chat configuration is present.

```bash
curl -fsS -X POST "$WORKER_BASE_URL/internal/pilot/real-integrations" \
  -H "content-type: application/json" \
  -H "x-internal-api-secret: $INTERNAL_API_SECRET" \
  -d '{"runTelegramReview":true,"telegramText":"Review dry-run content","sourceUrl":"https://example.com/source"}'
```

Expected behavior:

- a review draft may be sent to the configured review chat when real review mode is enabled
- final Telegram channel publishing is not triggered
- publishing queue is not touched
- WordPress and providers are not called unless separately requested

## Step 4: WordPress draft pilot

Run only after WordPress real dry-run mode is intentionally enabled and WordPress configuration is present.

```bash
curl -fsS -X POST "$WORKER_BASE_URL/internal/pilot/real-integrations" \
  -H "content-type: application/json" \
  -H "x-internal-api-secret: $INTERNAL_API_SECRET" \
  -d '{"runWordPressDraft":true,"wordpressTitle":"Dry-run title","wordpressContent":"Dry-run content","sourceUrl":"https://example.com/source"}'
```

Expected behavior:

- creates a draft only when real WordPress dry-run mode is enabled and configured
- public WordPress publishing is not enabled
- media upload is not triggered
- Telegram and providers are not called unless separately requested

## Combined pilot

After each individual step has been verified, the operator may run a combined pilot by setting all three run flags to true.

This is still inspect-only orchestration. It does not launch production automation.

## Failure behavior

One failed step does not hide other step statuses. The result includes warnings and errors so the operator can identify which step failed.

Common outcomes:

- integration not requested: skipped
- missing URL: request validation error
- integration disabled: typed disabled result
- missing runtime config: typed missing configuration result
- API/client failure: typed step failure

## Immediate disable and rollback

After the pilot:

1. Disable Firecrawl provider enablement.
2. Disable Telegram real review mode.
3. Disable WordPress real dry-run mode.
4. Confirm scheduler remains disabled or dry-run guarded.
5. Confirm `/status` and `/ready` do not expose secrets.
6. Delete WordPress draft content if it should not remain.
7. Remove or rotate temporary credentials if disposable credentials were used.

Rollback options:

- revert the PR and redeploy
- disable runtime flags
- return provider mode to mock
- keep scheduler disabled
- keep publishing disabled

## No-launch criteria

Do not proceed to launch if any of these are true:

- readiness reports production-blocking errors
- scheduler is enabled unintentionally
- provider mode is not understood
- Firecrawl is enabled outside a sandbox check
- Telegram real review mode is enabled unintentionally
- WordPress dry-run mode is enabled unintentionally
- final Telegram publishing is enabled unintentionally
- public WordPress publishing is enabled unintentionally
- any response or log exposes secret values

## Troubleshooting

Start with:

```bash
curl -fsS "$WORKER_BASE_URL/health"
curl -fsS "$WORKER_BASE_URL/status"
curl -fsS "$WORKER_BASE_URL/ready"
```

Then run readiness-only pilot with `{}`.

If a step fails, inspect that step's typed error and verify runtime configuration by presence only. Never print or paste secret values while troubleshooting.
