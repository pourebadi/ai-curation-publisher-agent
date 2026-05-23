# AI Curation Publisher Agent

Incremental, provider-agnostic social content curator and publisher for Telegram and WordPress.

This repository implements a staged content pipeline that can ingest public social or web content, normalize provider-specific payloads into a shared model, deduplicate and validate items before expensive processing, generate AI-assisted outputs, route content through Telegram review, queue approved content for publishing, and prepare Telegram and WordPress publishing payloads through mock-safe abstractions.

The project is intentionally mock-first. Real providers, real final Telegram publishing, real WordPress publishing, scheduler side effects, and real media processing are not enabled by default.

Phase 23 finalizes the MVP readiness package. It adds final status and launch checklist docs without changing runtime behavior. Start with `docs/MVP_STATUS.md` and `docs/MVP_LAUNCH_CHECKLIST.md` before any operator launch decision.

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

## MVP status

The MVP is ready for controlled operator verification, not unattended production automation.

Implemented:

- core lifecycle, dedupe, validation, and ingest gates
- manual Telegram ingest
- AI output abstraction
- Telegram review flow
- publishing queue abstractions
- Telegram and WordPress publishing abstractions
- media preparation abstraction
- provider adapters and mock ingestion
- Firecrawl, Telegram review, and WordPress draft dry-run paths
- controlled real integrations pilot route
- Cloudflare Worker operational routes
- scheduler safeguards and quota foundations
- deployment, dry-run, and launch readiness documentation

Disabled or mock-safe by default:

- real social providers
- final Telegram publishing
- public WordPress publishing
- media download/upload
- scheduler side effects
- external monitoring/alerting
- dashboard

For the detailed matrix, see `docs/MVP_STATUS.md`.

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

## Key commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm worker:dev
pnpm worker:deploy
pnpm d1:migrate:local
pnpm d1:migrate:remote
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

If the internal route secret is configured, include the internal route header from your shell or secret store.

## Important docs

- `docs/MVP_STATUS.md` - final MVP implementation and limitation matrix
- `docs/MVP_LAUNCH_CHECKLIST.md` - go/no-go checklist
- `docs/RUNBOOK.md` - operational runbook
- `docs/PRODUCTION_DRY_RUN.md` - Cloudflare deployment dry-run checklist
- `docs/CONTROLLED_REAL_INTEGRATIONS_PILOT.md` - pilot workflow for Firecrawl, Telegram review, and WordPress draft checks
- `docs/SCHEDULER_OPERATIONS.md` - scheduler and quota safeguard guide
- `docs/TELEGRAM_REVIEW_DRY_RUN.md` - Telegram review dry-run guide
- `docs/WORDPRESS_DRY_RUN.md` - WordPress draft dry-run guide

## Safe defaults

- mock mode is the default
- scheduler is disabled by default
- real providers are disabled by default
- final Telegram publishing is disabled by default
- public WordPress publishing is disabled by default
- media download/upload is disabled by default
- tests must not make real external calls
- `.env.example` must contain empty values only

## Launch readiness

Before any MVP launch decision:

1. Run `pnpm lint`.
2. Run `pnpm typecheck`.
3. Run `pnpm test`.
4. Run local Worker smoke checks.
5. Apply intended D1 migrations.
6. Deploy manually.
7. Confirm `/health`, `/status`, and `/ready`.
8. Run mock E2E smoke.
9. Run controlled pilot readiness-only check.
10. Complete `docs/MVP_LAUNCH_CHECKLIST.md`.

## Known limitations

- Real providers are opt-in and not default.
- Firecrawl/Web is available only through an explicit inspect-only sandbox route when enabled.
- Controlled real integrations pilot steps are explicit opt-in only.
- Real final Telegram publishing is not enabled by default.
- Public WordPress publishing is not enabled by default.
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
