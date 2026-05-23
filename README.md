# AI Curation Publisher Agent

Incremental, provider-agnostic social content curator and publisher for Telegram and WordPress.

This repository implements a staged content pipeline that can ingest public social or web content, normalize provider-specific payloads into a shared model, deduplicate and validate items before expensive processing, generate AI-assisted outputs, route content through Telegram review, queue approved content for publishing, and prepare Telegram and WordPress publishing payloads through mock-safe abstractions.

The project is intentionally mock-first. Real providers, real final Telegram publishing, real WordPress publishing, scheduler side effects, and real media processing are not enabled by default.

Phase 21 adds scheduler and production-operations safeguards. The scheduler remains disabled by default, manual scheduler runs stay mock-safe, and publishing/provider side effects remain blocked unless a later scoped phase explicitly changes that behavior. See `docs/SCHEDULER_OPERATIONS.md` for operator guidance.

Phase 22 adds a controlled real integrations pilot route for sequential, explicit opt-in checks of Firecrawl, Telegram review, and WordPress draft readiness. It is not a launch path and does not enable scheduler, final Telegram publishing, public WordPress publishing, or automatic provider rollout. See `docs/CONTROLLED_REAL_INTEGRATIONS_PILOT.md`.

## What this system does

The pipeline supports:

1. Manual Telegram ingest from text or links.
2. Provider-normalized source polling through mock providers by default.
3. Dedupe and validation before AI, media, review, or publishing work.
4. AI output generation through a provider-agnostic abstraction.
5. Telegram review message creation and callback routing.
6. Publishing queue abstractions.
7. Mock-safe final Telegram publishing.
8. Mock-safe WordPress payload preparation and draft dry-run support.
9. Mock-safe media preparation abstractions.
10. Operational Worker routes for health, readiness, status, poll, E2E smoke, and controlled dry-runs.
11. Scheduler safeguards with disabled-by-default cron behavior and manual dry-run controls.
12. Controlled real integrations pilot orchestration for explicit dry-run checks.

## Current status

Implemented:

- pnpm workspace scaffold
- core models
- dedupe helpers
- validation helpers
- lifecycle guards
- D1 repositories and services
- manual Telegram ingest
- Telegram review flow
- AI output pipeline with mock provider support
- publishing queue abstractions
- final Telegram publishing abstraction
- WordPress publishing abstraction
- media preparation abstraction
- mock provider adapters and source ingestion
- poller orchestration
- Worker operational routes
- Cloudflare/GitHub workflow support
- real provider stubs behind feature flags
- Firecrawl/Web sandbox route as explicit opt-in only
- Telegram review-channel dry-run as explicit opt-in only
- WordPress draft dry-run as explicit opt-in only
- controlled real integrations pilot route as explicit opt-in only
- E2E mock smoke pipeline
- production readiness hardening
- scheduler and quota/cost-control foundations

Mock or disabled by default:

- real social providers
- real final Telegram publishing
- real WordPress publishing
- real media download or upload
- scheduler side effects
- production monitoring or alerting
- durable distributed rate limiting
- dashboard

## Architecture overview

```text
apps/worker-api
  Worker fetch and scheduled entrypoint
  HTTP route handlers
  operational dry-run and scheduler operations
  internal auth and readiness/status helpers

packages/core
  shared domain types, lifecycle, dedupe, validation

packages/db
  D1 repositories and services

packages/providers
  provider adapter interfaces, mocks, real-provider stubs, pollers

packages/ai
  AI provider abstraction, mock provider, output services

packages/telegram
  Telegram parsing, review message formatting, client abstractions

packages/wordpress
  WordPress output model, post builder, mock client, REST client

packages/media
  media asset types, mock media processor, preparation service
```

## Main flows

Manual Telegram flow:

```text
Telegram message/link
-> webhook parser
-> manual ingest
-> normalize
-> dedupe/validation/lifecycle gate
-> AI output
-> Telegram review
-> review callback
-> queue approval path
-> mock-safe final publish abstraction
-> optional WordPress service path
```

Mock provider flow:

```text
source config
-> mock provider
-> normalized posts
-> poller
-> ingest gate
-> downstream services
```

E2E mock smoke flow:

```text
mock source poll
-> normalize
-> ingest gate
-> AI
-> review
-> approval simulation
-> publish queue
-> mock Telegram publish
-> mock WordPress publish
```

Scheduler safeguard flow:

```text
Cloudflare scheduled handler
-> scheduler config check
-> skip if disabled
-> mock-safe poll when explicitly enabled
-> no publishing side effects in Phase 21
```

Controlled real integrations pilot flow:

```text
POST /internal/pilot/real-integrations
-> readiness/config summary
-> optional Firecrawl sandbox fetch
-> optional Telegram review dry-run
-> optional WordPress draft dry-run
-> no scheduler activation
-> no final Telegram publishing
-> no public WordPress publishing
```

Manual scheduler dry-run route:

```text
POST /internal/scheduler/run
```

## Worker routes

| Route | Method | Purpose |
| --- | --- | --- |
| `/` | GET | Alias for health. |
| `/health` | GET | Liveness check. |
| `/ready` | GET | Safe runtime readiness/config summary. |
| `/status` | GET | Safe operational module, provider, scheduler, quota, and pilot summary. |
| `/telegram/webhook` | POST | Telegram webhook for manual ingest and review callbacks. |
| `/internal/poll` | POST | Mock-safe provider poll operation. |
| `/internal/scheduler/run` | POST | Manual scheduler dry-run operation. |
| `/internal/pilot/real-integrations` | POST | Controlled real integrations pilot orchestration. |
| `/internal/providers/firecrawl/sandbox-fetch` | POST | Explicit Firecrawl/Web inspect-only sandbox fetch. |
| `/internal/telegram/review-dry-run` | POST | Explicit Telegram review-channel dry-run. |
| `/internal/wordpress/dry-run` | POST | Explicit WordPress draft dry-run. |
| `/internal/e2e/mock-pipeline` | POST | Full mock E2E smoke scenario. |
| `/internal/publish/telegram` | POST | Mock-safe Telegram publish route. |

Internal routes are protected when `INTERNAL_API_SECRET` is configured. The request must include `x-internal-api-secret` with the configured runtime value. Do not commit or log that value.

## Scheduler and quota safeguards

Phase 21 adds scheduler runtime safeguards and lightweight quota foundations.

Safe defaults:

- scheduler disabled
- dry-run enabled
- mock providers only
- real providers not allowed
- publishing not allowed
- conservative source/item limits
- AI and publish quotas default to zero

Runtime names documented for operators:

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
```

The scheduled handler returns/logs a skipped result when scheduler is disabled. Manual scheduler dry-runs can be triggered through `/internal/scheduler/run` and remain mock-safe.

See `docs/SCHEDULER_OPERATIONS.md` for the operator guide.

## Controlled real integrations pilot

Phase 22 adds a single internal pilot route:

```text
POST /internal/pilot/real-integrations
```

Default `{}` request behavior returns readiness/config summary only. Each integration step must be explicitly requested with a run flag.

The pilot can coordinate:

- Firecrawl sandbox fetch
- Telegram review dry-run
- WordPress draft dry-run

It never launches scheduler behavior, final Telegram publishing, public WordPress publishing, media processing, or automatic provider rollout.

See `docs/CONTROLLED_REAL_INTEGRATIONS_PILOT.md` for the operator checklist.

## Local development

Requirements:

- Node.js 22+
- pnpm 9+
- Wrangler through project dependencies

Install:

```bash
corepack enable
corepack prepare pnpm@9.15.4 --activate
pnpm install
```

Local D1 migrations:

```bash
pnpm d1:migrate:local
```

Run the Worker locally:

```bash
pnpm worker:dev
```

Smoke commands:

```bash
WORKER_BASE_URL=http://localhost:8787 pnpm worker:health
WORKER_BASE_URL=http://localhost:8787 pnpm worker:smoke
WORKER_BASE_URL=http://localhost:8787 pnpm worker:e2e:mock
```

Manual scheduler dry-run:

```bash
curl -fsS -X POST "$WORKER_BASE_URL/internal/scheduler/run" \
  -H "content-type: application/json" \
  -d '{"dryRun":true,"maxSources":1,"maxItems":1}'
```

Controlled pilot readiness-only check:

```bash
curl -fsS -X POST "$WORKER_BASE_URL/internal/pilot/real-integrations" \
  -H "content-type: application/json" \
  -d '{}'
```

If `INTERNAL_API_SECRET` is configured, include the internal route header using a value from your local shell or secret store.

## Testing

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Testing rules:

- No real external network calls in tests.
- No real provider credentials in tests.
- No real Telegram Bot API calls in tests.
- No real WordPress API calls in tests.
- No real media downloads or ffmpeg/yt-dlp execution in tests.
- Use mock providers, mock HTTP clients, mock Telegram clients, mock WordPress clients, and mock media processors.

## Deployment and operations

Detailed operator guides:

- `docs/PRODUCTION_DRY_RUN.md`
- `docs/SCHEDULER_OPERATIONS.md`
- `docs/CONTROLLED_REAL_INTEGRATIONS_PILOT.md`
- `docs/FIRECRAWL_SANDBOX.md` if present in the branch history
- `docs/TELEGRAM_REVIEW_DRY_RUN.md`
- `docs/WORDPRESS_DRY_RUN.md`
- `docs/RUNBOOK.md`

Before deployment:

1. Run `pnpm lint`.
2. Run `pnpm typecheck`.
3. Run `pnpm test`.
4. Apply required D1 migrations.
5. Configure Cloudflare/GitHub secrets outside the repository.
6. Confirm `/health`, `/status`, and `/ready`.
7. Run mock smoke checks.
8. Run manual scheduler dry-run.
9. Run controlled pilot readiness-only check.
10. Confirm rollback steps.

## Configuration and secrets

`.env.example` must stay sanitized with empty values only. Do not commit real values or credential-looking placeholders.

Use these storage locations:

- `.dev.vars` for local-only runtime values
- Cloudflare Worker secrets for deployed runtime secrets
- GitHub Actions secrets for deployment credentials

Never commit real values for tokens, secrets, passwords, API keys, webhook secrets, internal API secrets, provider credentials, WordPress application passwords, or private infrastructure identifiers.

## Production readiness checklist

Before production rollout, confirm:

- remote D1 database exists
- migrations have been applied
- Cloudflare Worker deployment target is configured
- Cloudflare runtime secrets are set outside the repository
- GitHub Actions secrets are set outside the repository
- `INTERNAL_API_SECRET` is configured for deployed internal routes
- `/health`, `/status`, and `/ready` pass
- mock E2E smoke pipeline passes
- manual scheduler dry-run passes
- controlled pilot readiness-only check passes
- real providers remain disabled until a scoped rollout enables them
- scheduler remains disabled or dry-run/mock-safe
- publishing remains disabled by default
- logs do not expose raw secret values
- rollback path is known

## Known limitations

- Real providers are disabled by default.
- Firecrawl/Web is available only through an explicit inspect-only sandbox route when enabled.
- Controlled real integrations pilot steps are explicit opt-in only.
- Real final Telegram publishing is not enabled by default.
- Real WordPress publishing is not enabled by default.
- Scheduler side effects are not enabled by default.
- No real media download or upload pipeline is active.
- No dashboard is implemented.
- No durable distributed rate limiting is implemented.
- No external monitoring or alerting integration exists yet.

## Contributor and AI agent rules

1. Keep phases scoped.
2. Do not add real secrets.
3. Do not add secret-looking placeholder values.
4. Do not enable real providers by default.
5. Do not enable real publishing by default.
6. Do not make external network calls in tests.
7. Do not bypass dedupe, validation, lifecycle, scheduler, or pilot safeguards.
8. Prefer provider abstractions over direct third-party API calls.
9. Run `pnpm lint`, `pnpm typecheck`, and `pnpm test` before opening or merging PRs.
10. Update operational docs for operational behavior changes.
