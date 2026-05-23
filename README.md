# AI Curation Publisher Agent

A provider-agnostic social/web content curation, review, and publishing pipeline for Cloudflare Workers, using mock-safe defaults, opt-in real integrations, and a safe browser-based operator dashboard.

This README is the main source of truth for product owners, maintainers, operators, and AI coding agents working on this repository.

## Executive summary

AI Curation Publisher Agent is a Cloudflare Worker-based backend for collecting public social or web content, normalizing it into a shared content model, deduplicating and validating it before expensive processing, generating AI-assisted publishing outputs, sending content through a human Telegram review flow, and preparing approved content for Telegram and WordPress publishing abstractions.

The MVP is mock-first and safety-first. Real providers, scheduler side effects, final Telegram publishing, public WordPress publishing, and media download/upload are not enabled by default.

Phase 24 adds a browser-based operator dashboard under `apps/dashboard`. The dashboard is intended for a non-technical operator to check health, readiness, configuration state, safe smoke operations, scheduler safety, and controlled pilot readiness without using curl for normal checks.

## Current MVP status

| Area | Status | Notes |
| --- | --- | --- |
| Worker API | Implemented | Cloudflare Worker exposes public, Telegram, and internal operational routes. |
| D1 database | Implemented | D1 binding and migrations exist; remote database setup remains operator-controlled. |
| Core lifecycle | Implemented | Lifecycle guards protect staged transitions. |
| Dedupe | Implemented | Dedupe keys are generated before expensive work. |
| Validation | Implemented | Invalid content is stopped before downstream processing. |
| Manual ingest | Implemented | Telegram/manual text and URL input can create normalized items. |
| AI output | Implemented, mock-safe | AI output pipeline exists with mock-safe tests/default flows. |
| Telegram review | Implemented | Review messages, buttons, and callback handling exist. |
| Telegram final publishing abstraction | Implemented, mock default | Real final channel publishing is not enabled by default. |
| WordPress abstraction | Implemented | Mock client and explicit draft dry-run path exist. |
| Media pipeline | Implemented as abstraction | No real production media download/upload is enabled by default. |
| Providers | Implemented | Mock providers are default; real stubs are gated. |
| Firecrawl sandbox | Explicit opt-in | Inspect-only Web/Firecrawl sandbox path exists. |
| Telegram review dry-run | Explicit opt-in | Review-channel dry-run only; no final channel publish. |
| WordPress draft dry-run | Explicit opt-in | Draft-only when explicitly enabled and configured. |
| Scheduler safeguards | Implemented | Scheduler is disabled/dry-run guarded by default. |
| Controlled pilot | Implemented | Explicit pilot route coordinates Firecrawl, Telegram review, and WordPress draft checks. |
| Operator dashboard | Implemented MVP | React/Vite dashboard talks to the Worker API and stores local operator settings in the browser. |
| Monitoring/alerts | Not production-integrated | No external monitoring or alerting service is wired. |
| Public dashboard auth | Not implemented in app | Protect production dashboard deployment with Cloudflare Access or equivalent. |

## Architecture

```text
Operator / Telegram / Sources
  |
  v
Cloudflare Worker (apps/worker-api)
  |-- health/status/ready routes
  |-- Telegram webhook
  |-- protected internal operations
  |
  v
Core lifecycle + validation + dedupe (packages/core)
  |-- Provider layer (packages/providers)
  |-- AI layer (packages/ai)
  |-- Telegram layer (packages/telegram)
  |-- WordPress layer (packages/wordpress)
  |-- Media layer (packages/media)
  v
D1 repositories/services (packages/db)

Operator Dashboard (apps/dashboard)
  -> calls Worker API over HTTPS
  -> stores Worker API URL locally
  -> stores internal API credential in browser storage only when the operator chooses
  -> never displays saved credential values
```

Package ownership:

| Path | Purpose |
| --- | --- |
| `apps/worker-api` | Worker entrypoint, routes, scheduled handler, operations, internal auth, readiness/status. |
| `apps/dashboard` | React/Vite operator dashboard deployable to Cloudflare Pages. |
| `packages/core` | Shared models, lifecycle, dedupe, validation. |
| `packages/db` | D1 migrations, repositories, services. |
| `packages/providers` | Provider adapters, mocks, real stubs, registry, HTTP clients, mappers. |
| `packages/ai` | AI provider abstraction, prompts, output schemas. |
| `packages/telegram` | Telegram parsing, review message formatting, clients. |
| `packages/wordpress` | WordPress output model, post builder, clients, publishing service. |
| `packages/media` | Media asset model and mock preparation service. |
| `.github/workflows` | CI, deploy, smoke, D1 migration, and backup/export stub workflows. |

## Main data flows

### Manual Telegram flow

```text
Telegram/manual input
-> webhook parser
-> manual ingest
-> normalize
-> validate
-> dedupe
-> lifecycle transition
-> AI output
-> Telegram review message
-> callback approve/cancel/status
-> queue for publish abstraction
-> Telegram final abstraction
-> WordPress abstraction
```

### Provider polling flow

```text
source config
-> provider registry
-> source poller
-> normalized posts
-> ingest gate
-> dedupe/validation
-> downstream processing
```

### E2E mock smoke flow

```text
mock source
-> mock provider
-> mock AI
-> mock Telegram review
-> simulated approval
-> mock final Telegram publish
-> mock WordPress publish
-> structured result
```

### Controlled real integrations pilot

```text
readiness summary
-> optional Firecrawl sandbox
-> optional Telegram review dry-run
-> optional WordPress draft dry-run
-> no scheduler activation
-> no final Telegram publish
-> no public WordPress publish
```

## Lifecycle and safety rules

Core item states include `discovered`, `normalized`, `validated`, `queued_for_ai`, `ai_processed`, `sent_to_review`, `approved`, `queued_for_publish`, `published`, `duplicate_skipped`, `invalid`, `failed`, and `cancelled`.

Safety rules:

- no AI before dedupe and validation
- duplicates are skipped before costly processing
- invalid content never proceeds downstream
- approval gates publishing
- scheduler does not publish by default
- controlled pilot checks are explicit opt-in only

## Dedupe and validation

Dedupe helpers include stable hashing, text normalization, canonical URL normalization, media URL hashing, stable IDs, fallback composite keys, and full dedupe key generation.

Supported dedupe keys:

- `platform_source_post_id`
- `canonical_url_hash`
- `normalized_text_hash`
- `media_url_hash`
- `fallback_composite`

Validation checks include URL presence where required, allowed URL schemes, valid platform/source type, source identity or fallback identity, and content availability.

## Provider system

The provider layer owns provider adapters, registry/factory behavior, mock providers, real provider stubs, Firecrawl sandbox integration, response mappers, HTTP client abstraction, provider error categories, and failover readiness.

Real provider integration names are documented as runtime configuration names only:

- `PROVIDERS_MODE`
- `ENABLE_APIFY_PROVIDER`
- `ENABLE_GETXAPI_PROVIDER`
- `ENABLE_FIRECRAWL_PROVIDER`
- `APIFY_TOKEN`
- `GETXAPI_KEY`
- `FIRECRAWL_API_KEY`
- `FIRECRAWL_BASE_URL`
- `FIRECRAWL_TIMEOUT_MS`

Mock providers remain default.

## AI pipeline

The AI layer is provider-agnostic and mock-safe by default. It supports prompt rendering, Telegram output, and WordPress output separation.

Runtime names:

- `AI_PROVIDER`
- `AI_API_KEY`

Real AI calls are not required for tests.

## Telegram pipeline

Telegram supports manual ingest, review message formatting, review buttons, callback handling, and a review-channel dry-run path. Final Telegram publishing is abstracted and not enabled by default.

Runtime names:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_REVIEW_CHAT_ID`
- `TELEGRAM_FINAL_CHAT_ID`
- `TELEGRAM_ALLOWED_REVIEWER_IDS`
- `TELEGRAM_REAL_REVIEW_ENABLED`

Treat Telegram tokens, webhook values, chat IDs, and reviewer IDs as sensitive operational configuration.

## WordPress pipeline

WordPress supports output modeling, post payload building, mock client behavior, real REST client readiness, and draft-only dry-run behavior. Public WordPress publishing is not enabled by default, and media upload is not part of the MVP.

Runtime names:

- `WORDPRESS_BASE_URL`
- `WORDPRESS_USERNAME`
- `WORDPRESS_APPLICATION_PASSWORD`
- `WORDPRESS_DEFAULT_STATUS`
- `WORDPRESS_REAL_DRY_RUN_ENABLED`

## Media pipeline

The media pipeline supports image, video, thumbnail, and carousel metadata with mock preparation. Production media download, ffmpeg, yt-dlp, R2 upload, Telegram media sending, and WordPress media upload are not enabled by default.

## Scheduler and operation safeguards

Scheduler defaults are safe:

- disabled by default
- dry-run by default
- mock providers only by default
- publishing blocked by default
- conservative source/item limits

Runtime names:

- `SCHEDULER_ENABLED`
- `SCHEDULER_DRY_RUN`
- `SCHEDULER_MAX_SOURCES_PER_RUN`
- `SCHEDULER_MAX_ITEMS_PER_RUN`
- `SCHEDULER_ALLOW_REAL_PROVIDERS`
- `SCHEDULER_ALLOW_PUBLISHING`
- `MAX_AI_ITEMS_PER_RUN`
- `MAX_PROVIDER_ITEMS_PER_RUN`
- `MAX_PUBLISH_ITEMS_PER_RUN`

## Worker routes

| Route | Purpose | Auth | Real-service behavior |
| --- | --- | --- | --- |
| `GET /` | Health alias. | None. | No real calls. |
| `GET /health` | Liveness. | None. | No real calls. |
| `GET /status` | Safe status summary. | None. | No real calls. |
| `GET /ready` | Runtime readiness summary. | None. | No real calls. |
| `POST /telegram/webhook` | Telegram ingest/callbacks. | Telegram verification where configured. | Handles inbound Telegram-originated requests. |
| `POST /internal/poll` | Mock-safe poll operation. | Internal header when configured. | Mock by default. |
| `POST /internal/publish/telegram` | Mock-safe publish operation. | Internal header when configured. | Mock by default. |
| `POST /internal/e2e/mock-pipeline` | Full mock smoke flow. | Internal header when configured. | No real external calls. |
| `POST /internal/providers/firecrawl/sandbox-fetch` | Firecrawl sandbox fetch. | Internal header when configured. | Explicit opt-in only. |
| `POST /internal/telegram/review-dry-run` | Telegram review dry-run. | Internal header when configured. | Review only, no final publish. |
| `POST /internal/wordpress/dry-run` | WordPress draft dry-run. | Internal header when configured. | Draft-only when enabled. |
| `POST /internal/scheduler/run` | Manual scheduler dry-run. | Internal header when configured. | Dry-run only from dashboard. |
| `POST /internal/pilot/real-integrations` | Controlled pilot orchestration. | Internal header when configured. | Only requested/configured steps. |

## Internal route protection

Runtime name:

- `INTERNAL_API_SECRET`

Header name:

- `x-internal-api-secret`

Local/mock mode may leave this unset. Deployed internal routes should use it. Do not expose the configured value in logs, docs, screenshots, responses, or browser UI.

## Operator dashboard

The dashboard lives in `apps/dashboard` and is built with React, Vite, and TypeScript.

It can:

- configure the Worker API base URL locally
- store the internal API credential in session storage by default
- optionally remember the internal API credential in this browser
- show only whether the internal credential is configured or missing
- call `/health`, `/status`, and `/ready`
- translate status into plain-language manager guidance
- show safe configuration checklists
- run mock E2E smoke
- run manual scheduler dry-run
- run controlled pilot readiness-only
- run explicit Firecrawl, Telegram review, and WordPress draft pilot checks
- store the last 10 dashboard operation results in local storage

It intentionally cannot:

- set Cloudflare Worker values
- mutate Cloudflare secrets
- store or use Cloudflare API tokens
- enable scheduler
- enable real providers
- enable final Telegram publishing
- enable public WordPress publishing
- bypass backend safeguards

Run locally:

```bash
pnpm dashboard:dev
```

Build:

```bash
pnpm dashboard:build
```

Preview production build:

```bash
pnpm dashboard:preview
```

Deploy to Cloudflare Pages:

1. Build command: `pnpm dashboard:build`.
2. Output directory: `apps/dashboard/dist`.
3. Configure the dashboard URL protection outside the app, preferably with Cloudflare Access.
4. Open the dashboard and enter the Worker API base URL.
5. Enter the internal route credential locally if internal operations are needed.

The dashboard does not display saved credential values after saving.

## Configuration reference

| Variable | Where to set | Sensitive? | Purpose | Safety note |
| --- | --- | --- | --- | --- |
| `ENVIRONMENT` | `.dev.vars`, Cloudflare Variable | No | Runtime environment label. | Local/mock behavior can remain permissive. |
| `LOG_LEVEL` | `.dev.vars`, Cloudflare Variable | No | Logging level. | Avoid noisy production logs. |
| `INTERNAL_API_SECRET` | `.dev.vars`, Cloudflare Secret | Yes | Internal route guard. | Required for deployed internal operations. |
| `PROVIDERS_MODE` | `.dev.vars`, Cloudflare Variable | No | Provider mode. | Mock-safe by default. |
| `ENABLE_APIFY_PROVIDER` | Cloudflare Variable | No | Enables Apify-style stub. | Disabled by default. |
| `ENABLE_GETXAPI_PROVIDER` | Cloudflare Variable | No | Enables GetXAPI-style stub. | Disabled by default. |
| `ENABLE_FIRECRAWL_PROVIDER` | Cloudflare Variable | No | Enables Firecrawl sandbox provider. | Disabled by default. |
| `APIFY_TOKEN` | Cloudflare Secret | Yes | Provider credential name. | Do not commit. |
| `GETXAPI_KEY` | Cloudflare Secret | Yes | Provider credential name. | Do not commit. |
| `FIRECRAWL_API_KEY` | Cloudflare Secret | Yes | Firecrawl credential name. | Do not commit. |
| `FIRECRAWL_BASE_URL` | Cloudflare Variable | No | Optional endpoint override. | Use only intentionally. |
| `FIRECRAWL_TIMEOUT_MS` | Cloudflare Variable | No | Optional timeout. | Keep conservative. |
| `AI_PROVIDER` | Cloudflare Variable | No | AI provider selection. | Mock-safe tests. |
| `AI_API_KEY` | Cloudflare Secret | Yes | AI provider credential. | Do not commit. |
| `TELEGRAM_BOT_TOKEN` | Cloudflare Secret | Yes | Telegram Bot API credential. | Do not commit. |
| `TELEGRAM_WEBHOOK_SECRET` | Cloudflare Secret | Yes | Webhook verification value. | Do not commit. |
| `TELEGRAM_REVIEW_CHAT_ID` | Cloudflare Secret or Variable | Treat as sensitive | Review target. | Do not expose. |
| `TELEGRAM_FINAL_CHAT_ID` | Cloudflare Secret or Variable | Treat as sensitive | Final target. | Final publish disabled by default. |
| `TELEGRAM_ALLOWED_REVIEWER_IDS` | Cloudflare Secret or Variable | Treat as sensitive | Reviewer allowlist. | Do not expose. |
| `TELEGRAM_REAL_REVIEW_ENABLED` | Cloudflare Variable | No | Enables real review dry-run. | Disabled by default. |
| `WORDPRESS_BASE_URL` | Cloudflare Variable or Secret | Treat as sensitive | WordPress site. | Needed only for explicit dry-run. |
| `WORDPRESS_USERNAME` | Cloudflare Secret | Yes | WordPress REST username. | Do not expose. |
| `WORDPRESS_APPLICATION_PASSWORD` | Cloudflare Secret | Yes | WordPress REST credential. | Do not expose. |
| `WORDPRESS_DEFAULT_STATUS` | Cloudflare Variable | No | WordPress status. | Draft-oriented for MVP dry-run. |
| `WORDPRESS_REAL_DRY_RUN_ENABLED` | Cloudflare Variable | No | Enables WordPress draft dry-run. | Disabled by default. |
| `SCHEDULER_ENABLED` | Cloudflare Variable | No | Enables scheduler. | Disabled by default. |
| `SCHEDULER_DRY_RUN` | Cloudflare Variable | No | Keeps scheduler dry-run. | Safe default. |
| `SCHEDULER_MAX_SOURCES_PER_RUN` | Cloudflare Variable | No | Scheduler source limit. | Keep conservative. |
| `SCHEDULER_MAX_ITEMS_PER_RUN` | Cloudflare Variable | No | Scheduler item limit. | Keep conservative. |
| `SCHEDULER_ALLOW_REAL_PROVIDERS` | Cloudflare Variable | No | Allows scheduler real providers. | Disabled by default. |
| `SCHEDULER_ALLOW_PUBLISHING` | Cloudflare Variable | No | Allows scheduler publishing. | Disabled by default. |
| `MAX_AI_ITEMS_PER_RUN` | Cloudflare Variable | No | AI quota foundation. | Keep conservative. |
| `MAX_PROVIDER_ITEMS_PER_RUN` | Cloudflare Variable | No | Provider quota foundation. | Keep conservative. |
| `MAX_PUBLISH_ITEMS_PER_RUN` | Cloudflare Variable | No | Publish quota foundation. | Keep zero unless scoped. |
| `CLOUDFLARE_API_TOKEN` | GitHub Actions Secret | Yes | Deploy/migration workflow auth. | Never put in frontend code. |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub Actions Secret | Yes | Cloudflare workflow account identifier. | Use only in GitHub settings. |

## Secrets policy

- Real secrets must never be committed.
- Local runtime values go in `.dev.vars`.
- Production runtime secrets go in Cloudflare Worker Secrets.
- CI/deploy secrets go in GitHub Actions Secrets.
- The dashboard must not receive Cloudflare API tokens.
- The dashboard must not mutate Cloudflare secrets.
- Secret names are okay in docs; secret values are not.
- Do not use fake credential-looking placeholders.

## Local development

Requirements:

- Node.js 22 or newer
- pnpm 9.15.4 through Corepack

Install:

```bash
corepack enable
corepack prepare pnpm@9.15.4 --activate
pnpm install
```

Core checks:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm dashboard:build
```

Worker:

```bash
pnpm worker:dev
pnpm worker:deploy
pnpm d1:migrate:local
pnpm d1:migrate:remote
WORKER_BASE_URL=http://localhost:8787 pnpm worker:health
WORKER_BASE_URL=http://localhost:8787 pnpm worker:smoke
WORKER_BASE_URL=http://localhost:8787 pnpm worker:e2e:mock
```

Dashboard:

```bash
pnpm dashboard:dev
pnpm dashboard:build
pnpm dashboard:preview
```

## Testing strategy

Tests cover packages, routes, operations, providers, mappers, repositories, and mock E2E flows. Real network calls are not allowed in tests. Dashboard validation is currently build-oriented rather than a heavy frontend test suite.

## Cloudflare deployment and D1

The Worker uses `wrangler.toml`, D1 binding `DB`, and migrations under `packages/db/migrations`. Apply local migrations with `pnpm d1:migrate:local` and remote migrations with `pnpm d1:migrate:remote`.

GitHub workflows cover CI, manual deploy, smoke tests, D1 migrations, and a backup/export stub. Keep deploy and migration workflows manual unless a future scoped phase explicitly changes that behavior.

## Production readiness checklist

- [ ] `pnpm lint` passes.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm test` passes.
- [ ] `pnpm dashboard:build` passes.
- [ ] Worker boots locally.
- [ ] Dashboard runs locally.
- [ ] `/health`, `/status`, and `/ready` pass.
- [ ] Mock E2E smoke passes.
- [ ] Controlled pilot readiness-only passes.
- [ ] Internal route protection is configured for deployed environments.
- [ ] Scheduler remains disabled or dry-run guarded.
- [ ] Real providers remain disabled unless explicitly piloted.
- [ ] Final Telegram publishing remains disabled by default.
- [ ] Public WordPress publishing remains disabled by default.
- [ ] Dashboard deployment is protected with Cloudflare Access or equivalent.
- [ ] No sensitive runtime values appear in logs, responses, docs, tests, or frontend UI.

## Launch / no-launch criteria

Launch only if CI is green, readiness checks pass, internal auth is configured, smoke checks pass, dashboard build passes, controlled pilot readiness succeeds, and rollback is understood.

Do not launch if readiness fails, D1 migration state is uncertain, internal auth fails, unexpected real external calls occur, logs expose sensitive information, scheduler is enabled unintentionally, or public publishing is enabled unintentionally.

## Known limitations

- Dashboard is an operator MVP, not a SaaS admin system.
- Dashboard access control must be handled by Cloudflare Access or equivalent.
- No Cloudflare secret mutation from the dashboard.
- No Cloudflare API token in frontend code.
- No public publishing automation by default.
- No production media download/upload by default.
- No external monitoring/alerting integration.
- No durable quota dashboard.

## Contributor and AI agent rules

1. Keep changes scoped.
2. Do not add real secrets.
3. Do not add fake credential-looking placeholders.
4. Do not enable real integrations by default.
5. Do not enable scheduler side effects by default.
6. Do not enable real publishing by default.
7. Do not make real network calls in tests.
8. Do not bypass dedupe, validation, lifecycle, scheduler, auth, redaction, or dashboard safety guards.
9. Do not put Cloudflare API tokens or mutation flows in the dashboard.
10. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm dashboard:build` before opening or merging PRs.
