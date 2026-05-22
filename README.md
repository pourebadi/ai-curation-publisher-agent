# AI Curation Publisher Agent

Incremental, provider-agnostic social content curator and publisher for Telegram and WordPress.

This repository implements a staged content pipeline that can ingest public social or web content, normalize provider-specific payloads into a shared model, deduplicate and validate items before expensive processing, generate AI-assisted outputs, route content through Telegram review, queue approved content for publishing, and prepare Telegram and WordPress publishing payloads through mock-safe abstractions.

The project has been built incrementally through Phases 1-18. It is intentionally mock-first: the architecture is shaped for production integrations, but real providers, real Telegram sending, real WordPress publishing, and real media processing are not enabled by default.

Phase 18 adds an opt-in Firecrawl/Web sandbox route for one manual direct URL fetch. It is inspect-only and does not enqueue items, trigger AI, publish to Telegram, publish to WordPress, or process media.

## Table of contents

- [What this system does](#what-this-system-does)
- [Current implementation status](#current-implementation-status)
- [Architecture overview](#architecture-overview)
- [End-to-end flows](#end-to-end-flows)
- [Lifecycle and state model](#lifecycle-and-state-model)
- [Dedupe and validation](#dedupe-and-validation)
- [Provider system](#provider-system)
- [AI pipeline](#ai-pipeline)
- [Telegram pipeline](#telegram-pipeline)
- [WordPress pipeline](#wordpress-pipeline)
- [Media pipeline](#media-pipeline)
- [Worker routes](#worker-routes)
- [Local development](#local-development)
- [Testing strategy](#testing-strategy)
- [Deployment and operations](#deployment-and-operations)
- [Configuration and secrets](#configuration-and-secrets)
- [Production readiness checklist](#production-readiness-checklist)
- [Known limitations](#known-limitations)
- [Recommended next phases](#recommended-next-phases)
- [Contributor and AI agent rules](#contributor-and-ai-agent-rules)

## What this system does

The system curates content from public social and web sources, routes it through quality and safety gates, and publishes reviewed outputs to downstream channels.

At a high level, the pipeline supports:

1. Ingest public social or web content from manual Telegram input or provider adapters.
2. Normalize provider output into a common `NormalizedPost` shape.
3. Generate dedupe keys for platform/source IDs, canonical URLs, normalized text, media URLs, and fallback composite identities.
4. Validate raw normalized content before any expensive work.
5. Stop duplicate or invalid items before AI, media, review, or publishing queues.
6. Generate AI-assisted Telegram output through a provider-agnostic AI layer.
7. Create Telegram review messages with management buttons.
8. Handle Telegram review callback actions for edit, send, cancel, and status flows.
9. Queue approved items for publishing.
10. Publish final Telegram messages through a Telegram client abstraction, using mock clients by default.
11. Prepare and publish WordPress content through a WordPress client abstraction, using mock clients by default.
12. Represent and prepare image, video, thumbnail, and carousel media through a provider-agnostic media abstraction.
13. Run a mock end-to-end smoke scenario that exercises the full pipeline without external services.
14. Optionally run an inspect-only Firecrawl/Web sandbox fetch for one direct URL when explicitly enabled.

The repository is suitable for development, architecture validation, local smoke testing, and future staged production rollout. It is not yet configured for live provider scraping or real external publishing by default.

## Current implementation status

### Implemented

| Area | Status |
| --- | --- |
| Repository/workspace scaffold | Implemented as a pnpm monorepo with `apps/*` and `packages/*`. |
| Core models | Implemented in `packages/core` for platforms, sources, items, media, outputs, providers, queues, settings, lifecycle, dedupe, and validation. |
| Dedupe helpers | Implemented for stable hashing, text normalization, canonical URL hashing, normalized text hashing, media URL hashing, fallback composite keys, and dedupe key generation. |
| Validation helpers | Implemented for canonical URL, source identity, content availability, platform, and source type checks. |
| Lifecycle guards | Implemented with explicit item status transitions and costly-processing guard helpers. |
| DB repositories/services | Implemented under `packages/db` for items, sources, outputs, review messages, review actions, dedupe keys, publish queue, media assets, dedupe service, ingest gate, lifecycle service, publish queue service, and publishing service. |
| Manual Telegram ingest | Implemented through Telegram webhook parsing and manual message/link handling. |
| Telegram review flow | Implemented with review message formatting, inline buttons, callback parsing, and callback action routing. |
| AI output pipeline | Implemented with a provider-agnostic AI layer, mock AI provider, prompt rendering, and Telegram output schema. |
| Publishing queue | Implemented with queue models, repositories, and service abstractions. |
| Final Telegram publishing abstraction | Implemented through Telegram client interfaces and mock-safe publishing service behavior. |
| WordPress publishing abstraction | Implemented with WordPress output schema, post builder, mock client, and publishing service. |
| Media preparation abstraction | Implemented with media asset types, mock media processor, preparation service, and media asset repository support. |
| Provider adapters and mock ingestion | Implemented with provider adapter interfaces, mock Instagram/X/Web providers, registry, source ingestion service, and provider metadata. |
| Poller orchestration | Implemented with source poller and batch poller services using mock providers by default. |
| Worker operational routes | Implemented for health, readiness, status, Telegram webhook, internal poll, internal Telegram publish, internal E2E mock pipeline, and Firecrawl sandbox fetch. |
| Cloudflare/GitHub workflow support | Implemented with Wrangler config, CI workflow, deploy workflow, smoke workflow, D1 migration workflow, and backup/export workflow stub. |
| Real provider stubs behind feature flags | Implemented for Apify-style Instagram, GetXAPI-style X/Twitter, and Firecrawl-style Web providers. |
| Sandbox provider HTTP/mapping/error foundations | Implemented with provider HTTP client abstraction, fetch-based client, mock HTTP client, response mappers, provider errors, and failover metadata. |
| E2E mock smoke pipeline | Implemented as a Worker operation and internal route that exercises mock source polling through mock Telegram and WordPress publishing. |
| Firecrawl/Web sandbox provider | Implemented as an opt-in direct URL sandbox provider and inspect-only internal route. |
| Production readiness hardening | Implemented with internal route protection, readiness checks, safe config summary, safe logger redaction, consistent error responses, and rate-limit guard foundations. |

### Mock or stubbed by default

| Area | Default behavior |
| --- | --- |
| Real social providers | Disabled by default. Mock providers are used for tests and smoke scenarios. |
| Telegram Bot API production sending | Abstracted behind client interfaces. Tests and operational smoke paths use mock clients. |
| WordPress REST API publishing | Abstracted behind a WordPress client interface. Tests and smoke paths use `MockWordPressClient`. |
| Media download, ffmpeg, and yt-dlp | Not executed in tests. Media processing uses mock preparation by default. |
| Scheduler production activation | Wrangler has a mock-safe scheduled trigger, but production scheduler behavior is not fully activated for real provider/publishing workflows. |

### Not yet production-enabled

| Area | Status |
| --- | --- |
| Live provider rollout | Not enabled. Firecrawl has an opt-in manual sandbox route, but automatic real provider polling remains disabled by default. |
| Real credential setup | Not committed and not required for tests. Must be configured through Cloudflare/GitHub secrets in a future rollout. |
| Real Cloudflare production deployment smoke run | Workflow support exists, but production deployment validation is still a separate operational step. |
| Monitoring and alerting | Not integrated yet. |
| Cost quota enforcement | Cost-control gates exist at the pipeline level, but no production quota system is active. |
| Durable rate limiting | Only guard interfaces and an in-memory test guard exist. No Durable Objects, KV, or shared limiter is configured. |
| Dashboard | Not implemented. |

## Architecture overview

The repository is organized as a monorepo with one Cloudflare Worker application and multiple reusable packages.

```text
ai-curation-publisher-agent
|
|-- apps/
|   `-- worker-api/
|       |-- src/index.ts              # Worker fetch and scheduled entrypoint
|       |-- src/routes/               # HTTP route handlers
|       |-- src/operations/           # Operational orchestration helpers
|       |-- src/scheduled/            # Scheduled poll helper
|       |-- src/security/             # Internal auth and rate-limit guard foundations
|       |-- src/logging/              # Safe logger utilities
|       `-- src/config.ts             # Runtime config and readiness summaries
|
|-- packages/
|   |-- core/                         # Shared domain models, lifecycle, dedupe, validation
|   |-- db/                           # D1 repositories and services
|   |-- providers/                    # Provider adapters, registry, mocks, stubs, pollers
|   |-- ai/                           # AI provider abstraction, mock AI, prompts, output schema
|   |-- telegram/                     # Telegram parsing, review messages, client abstraction
|   |-- wordpress/                    # WordPress output, post builder, client abstraction
|   `-- media/                        # Media models, processor abstraction, mock processor
|
|-- packages/db/migrations/           # Cloudflare D1 migrations
|-- .github/workflows/                # CI, deploy, smoke, migration, backup-stub workflows
|-- wrangler.toml                     # Cloudflare Worker/D1/scheduled trigger config
|-- package.json                      # Workspace scripts
`-- docs/RUNBOOK.md                   # Operational runbook
```

### Runtime architecture

```text
                       +-------------------------------+
                       | Cloudflare Worker             |
                       | apps/worker-api               |
                       +---------------+---------------+
                                       |
          +----------------------------+-----------------------------+
          |                            |                             |
          v                            v                             v
 +----------------+          +------------------+          +------------------+
 | Telegram       |          | Internal routes  |          | Scheduled handler |
 | webhook        |          | poll/publish/e2e |          | mock-safe poller  |
 +-------+--------+          +---------+--------+          +---------+--------+
         |                             |                             |
         v                             v                             v
 +--------------------------------------------------------------------------+
 | Core pipeline                                                             |
 | normalize -> dedupe -> validate -> lifecycle -> cost-control gates        |
 +--------------------------------------------------------------------------+
         |                             |                             |
         v                             v                             v
 +----------------+          +------------------+          +------------------+
 | Providers      |          | AI output        |          | Media prep       |
 | mock/stubbed   |          | mock by default  |          | mock by default  |
 +-------+--------+          +---------+--------+          +---------+--------+
         |                             |                             |
         +-----------------------------+-----------------------------+
                                       |
                                       v
                              +----------------+
                              | D1 repositories|
                              | packages/db    |
                              +-------+--------+
                                      |
             +------------------------+------------------------+
             |                                                 |
             v                                                 v
  +----------------------+                         +-------------------------+
  | Telegram review and  |                         | WordPress publishing    |
  | final publish client |                         | client abstraction      |
  | mock by default      |                         | mock by default         |
  +----------------------+                         +-------------------------+
```

### Cloudflare and GitHub operations

The Worker entrypoint is `apps/worker-api/src/index.ts`. Wrangler config points to that entrypoint, defines a local/mock-safe D1 binding, and configures a mock-safe scheduled trigger. GitHub Actions provide CI, deploy, smoke testing, D1 migration, and a documented D1 backup/export stub.

## End-to-end flows

### Manual Telegram flow

```text
Telegram message or link
-> POST /telegram/webhook
-> parse Telegram update
-> manual text or URL normalization
-> item creation or reuse
-> ingest gate
-> dedupe and validation
-> lifecycle transition to queued_for_ai
-> AI Telegram output generation
-> Telegram review message creation
-> callback action: edit, send, cancel, or status
-> approved items enter publish queue
-> final Telegram publishing abstraction
-> optional WordPress service call or payload preparation
```

Important behavior:

- Manual text input is normalized and can be reused through normalized text hashing.
- Manual URL input is canonicalized and can be reused through canonical URL hashing.
- Callback actions are routed as scoped handlers/stubs where full downstream functionality is intentionally not yet production-enabled.
- The send/approval path marks an item as approved and queues it; it does not bypass lifecycle controls.

### Automated mock provider flow

```text
Source definition
-> provider registry
-> mock provider adapter
-> source ingestion service
-> normalized posts
-> ingest gate
-> dedupe and validation
-> downstream services
```

The mock provider flow is used by local operations, tests, scheduled-safe polling, and smoke scenarios. It allows the architecture to be exercised without real third-party APIs.

### Firecrawl/Web sandbox flow

```text
Internal operator request
-> POST /internal/providers/firecrawl/sandbox-fetch
-> internal route protection
-> Firecrawl provider availability/config check
-> ProviderHttpClient request when explicitly enabled
-> Firecrawl response mapper
-> NormalizedPost response for inspection
```

This route is inspect-only. It does not enqueue items, call the ingest gate, trigger AI, create Telegram review messages, publish to Telegram, publish to WordPress, or process media.

### E2E mock smoke flow

```text
Mock source poll
-> mock Instagram provider normalization
-> in-memory ingest gate
-> dedupe and validation
-> lifecycle transitions
-> mock AI Telegram output
-> Telegram review draft
-> simulated approval callback
-> in-memory publish queue
-> mock final Telegram publish
-> mock WordPress publish
-> structured run result
```

The E2E mock route is:

```text
POST /internal/e2e/mock-pipeline
```

It returns a structured result with fields such as `ok`, `sourceId`, `itemId`, `providerUsed`, `normalizedCount`, `queuedCount`, `duplicateCount`, `invalidCount`, `aiOutputCreated`, `reviewMessageCreated`, `approved`, `queuedForPublish`, `telegramPublished`, `finalMessageId`, `wordpressPrepared`, `wordpressPublished`, `wordpressPostId`, `warnings`, and `errors`.

## Lifecycle and state model

Item lifecycle is controlled in `packages/core/src/lifecycle.ts`. The current status set includes active states and terminal/failure states.

Major states include:

| State | Meaning |
| --- | --- |
| `discovered` | A candidate item has entered the system. |
| `normalized` | Provider/manual input has been normalized into the shared model. |
| `validated` | The item passed raw validation. |
| `queued_for_ai` | The item is eligible for AI processing. |
| `ai_processed` | AI output has been generated. |
| `media_ready` | Media preparation has completed when media preparation is part of the flow. |
| `sent_to_review` | A Telegram review draft has been sent or prepared. |
| `approved` | A reviewer approved the item for publishing. |
| `queued_for_publish` | The item is queued for publishing. |
| `published_telegram` | Final Telegram publishing completed through the publishing abstraction. |
| `published_wordpress` | WordPress publishing completed through the WordPress abstraction. |
| `archived` | The item has completed the active flow and can be archived. |
| `duplicate_skipped` | The item matched an existing dedupe key and was stopped. |
| `invalid` | The item failed validation and was stopped. |
| `failed` | A processing step failed. |
| `retry_pending` | The item is waiting for a retry path. |
| `cancelled` | A reviewer or service cancelled the item. |

Core lifecycle principles:

- No AI processing before dedupe and validation.
- Duplicate items must not enter AI, media, review, or publishing queues.
- Invalid items must not proceed downstream.
- Status transitions are explicit and guarded.
- Costly processing is only allowed from approved pipeline states, currently centered on `queued_for_ai` for AI entry.

## Dedupe and validation

Dedupe is implemented in `packages/core/src/dedupe.ts` and integrated through DB services and ingest gate logic.

Supported dedupe key types:

| Key type | Purpose |
| --- | --- |
| `platform_source_post_id` | Exact source identity from platform and source post ID. |
| `canonical_url_hash` | Reuse by normalized canonical URL. |
| `normalized_text_hash` | Reuse by normalized text content. |
| `media_url_hash` | Reuse by media source/canonical URL. |
| `fallback_composite` | Composite identity when stronger source identity is unavailable. |

Validation is implemented in `packages/core/src/validation.ts`. It checks:

- supported platform
- supported source type
- canonical URL presence and protocol
- source identity or fallback identity
- availability of at least one content signal: text, media, or link

The ingest gate uses these foundations to prevent invalid and duplicate items from reaching expensive downstream processing.

## Provider system

Provider logic lives in `packages/providers`.

The provider system includes:

- a provider adapter interface
- provider registry and priority resolution
- source ingestion service
- source poller and batch poller services
- mock providers for Instagram, X/Twitter, and Web
- real-provider-shaped stubs for Apify-style Instagram, GetXAPI-style X/Twitter, and Firecrawl-style Web crawling
- provider runtime configuration
- provider availability/status modeling
- provider error categories
- HTTP client abstraction
- response mappers
- fallback/failover metadata

### Mock providers

Mock providers are the default for tests, local smoke runs, and scheduled-safe operations. They return deterministic normalized posts and can simulate new posts, duplicates, empty results, provider failure, and unsupported source types.

### Real provider stubs

Real provider stubs exist for future rollout, but they are disabled by default. Firecrawl/Web has one explicit sandbox route for a single direct URL when enabled. Instagram and X/Twitter real provider activation remains out of scope for Phase 18.

When explicitly enabled and configured, real provider stubs can use the injected provider HTTP client and response mappers. Tests must use mock HTTP clients and must not perform external network calls.

### Provider configuration

Provider behavior is controlled by environment names only. Do not commit values for these names.

```text
PROVIDERS_MODE
ENABLE_APIFY_PROVIDER
ENABLE_GETXAPI_PROVIDER
ENABLE_FIRECRAWL_PROVIDER
FIRECRAWL_BASE_URL
FIRECRAWL_TIMEOUT_MS
APIFY_TOKEN
GETXAPI_KEY
FIRECRAWL_API_KEY
```

Expected behavior:

- mock mode is the default
- real provider stubs are disabled by default
- Firecrawl must be explicitly enabled before the sandbox route can call the provider
- missing credentials produce typed unavailable states instead of crashing the app
- disabled providers are skipped for normal polling
- provider failure can trigger fallback
- status/readiness summaries expose booleans or provider IDs, not secret values

### Provider error categories

Provider errors are typed so adapters, registries, pollers, and operational routes can reason about failures consistently. Categories include:

```text
provider_disabled
missing_credentials
unsupported_source_type
rate_limited
timeout
network_error
http_error
invalid_response
provider_error
unknown_error
```

## AI pipeline

AI logic lives in `packages/ai`.

Current behavior:

- provider-agnostic AI provider interface
- `MockAIProvider` default for tests and smoke flows
- prompt rendering helpers
- Telegram output schema and service
- WordPress output remains separate from Telegram output in the WordPress package
- no real AI provider keys are required for tests

The AI pipeline is intentionally downstream of dedupe and validation. Items should only enter AI processing after the ingest gate and lifecycle guards allow them to do so.

Environment names related to AI:

```text
AI_PROVIDER
AI_API_KEY
```

These names are documented for future configuration. Values must not be committed.

## Telegram pipeline

Telegram logic lives in `packages/telegram` and Worker route handlers.

Current capabilities:

- Telegram webhook route: `POST /telegram/webhook`
- manual text input parsing
- manual URL extraction
- reviewer allow-list parsing
- callback parsing for review actions
- review message formatting
- inline keyboard buttons:
  - Edit
  - Send
  - Cancel
  - Status
- mock Telegram client for review and final publishing tests
- publishing service integration through DB repositories

Review callback data is scoped to review actions and item IDs. The callback flow is intended to support manager review without directly exposing publishing internals.

Final Telegram publishing is abstracted. Tests and smoke paths use mock clients; real Telegram Bot API production sending is not enabled by default.

## WordPress pipeline

WordPress logic lives in `packages/wordpress`.

Current capabilities:

- `WordPressClient` interface
- `MockWordPressClient`
- WordPress output model separate from Telegram output
- post payload builder
- publishing service
- draft-oriented/default-safe publishing behavior where configured by the service call
- support for title, slug, excerpt, body/content, source URL, attribution, tags, categories, featured image URL, and optional metadata fields

The WordPress pipeline is shaped for REST-compatible publishing, but real WordPress API calls and real credentials are not required by default. Tests use the mock client.

Environment names related to WordPress:

```text
WORDPRESS_BASE_URL
WORDPRESS_USERNAME
WORDPRESS_APPLICATION_PASSWORD
```

Values must be configured through local or platform secret mechanisms, not committed.

## Media pipeline

Media logic lives in `packages/media`, with repository support exported from `packages/db`.

Current capabilities:

- media asset model/helpers
- image, video, thumbnail, and carousel/multi-media representations
- source URL and canonical URL tracking
- local path or storage key metadata
- MIME type, size, duration, width, and height metadata where available
- processing statuses:
  - `pending`
  - `ready`
  - `failed`
  - `skipped`
- `MediaProcessor` interface
- `MockMediaProcessor`
- media preparation service
- thumbnail metadata generation in mock processing
- carousel grouping preservation
- media asset repository support

The media pipeline does not run real media downloads, yt-dlp, ffmpeg, R2 upload, Telegram media sending, or WordPress media upload in tests.

## Worker routes

The Worker entrypoint is `apps/worker-api/src/index.ts`.

| Route | Method | Purpose |
| --- | --- | --- |
| `/` | GET | Alias for health. |
| `/health` | GET | Basic liveness response. |
| `/ready` | GET | Readiness/config validation response. Returns `503` when production-required config is missing. |
| `/status` | GET | Operational module status and safe config summaries. Does not expose secret values. |
| `/telegram/webhook` | POST | Telegram webhook for manual ingest and review callbacks. |
| `/internal/poll` | POST | Runs mock-safe source polling through provider orchestration. |
| `/internal/providers/firecrawl/sandbox-fetch` | POST | Opt-in inspect-only Firecrawl/Web direct URL sandbox fetch. |
| `/internal/publish/telegram` | POST | Attempts to publish the next eligible Telegram queue item through the mock-safe publishing abstraction. |
| `/internal/e2e/mock-pipeline` | POST | Runs the full mock E2E smoke scenario. |

### Internal route protection

Internal routes are protected when `INTERNAL_API_SECRET` is configured:

```text
POST /internal/poll
POST /internal/providers/firecrawl/sandbox-fetch
POST /internal/publish/telegram
POST /internal/e2e/mock-pipeline
```

Behavior:

- Local/mock mode remains easy: when `INTERNAL_API_SECRET` is unset, internal routes can be called without the header.
- When `INTERNAL_API_SECRET` is configured, requests must include the `x-internal-api-secret` header set to the configured runtime secret.
- Unauthorized requests return structured `401` errors.
- Secret values are not exposed in responses.

## Local development

### Requirements

- Node.js 22+
- pnpm 9+
- Cloudflare Wrangler through project dev dependencies

Enable pnpm through Corepack if needed:

```bash
corepack enable
corepack prepare pnpm@9.15.4 --activate
```

### Install dependencies

```bash
pnpm install
```

### Local environment

Create local runtime values from the sanitized example file:

```bash
cp .env.example .dev.vars
```

Rules:

- `.dev.vars` is local only.
- Do not commit `.dev.vars`.
- Do not add real secrets to `README.md`, `.env.example`, tests, workflow files, or docs.

### Run local D1 migrations

```bash
pnpm d1:migrate:local
```

### Run the Worker locally

```bash
pnpm worker:dev
```

### Useful scripts

| Script | Purpose |
| --- | --- |
| `pnpm lint` | Run repository lint checks. |
| `pnpm typecheck` | Run TypeScript build/typecheck. |
| `pnpm test` | Run Vitest test suite. |
| `pnpm worker:dev` | Start the Worker locally. |
| `pnpm worker:deploy` | Deploy Worker through Wrangler. |
| `pnpm worker:health` | Call `/health` on `WORKER_BASE_URL` or local default. |
| `pnpm worker:smoke` | Call `/health` and `/status`. |
| `pnpm worker:e2e:mock` | Call `POST /internal/e2e/mock-pipeline`. |
| `pnpm d1:migrate:local` | Apply D1 migrations locally. |
| `pnpm d1:migrate:remote` | Apply D1 migrations remotely. |

### Local smoke checks

```bash
WORKER_BASE_URL=http://localhost:8787 pnpm worker:health
WORKER_BASE_URL=http://localhost:8787 pnpm worker:smoke
WORKER_BASE_URL=http://localhost:8787 pnpm worker:e2e:mock
```

Readiness:

```bash
curl -fsS "$WORKER_BASE_URL/ready"
```

Mock poll:

```bash
curl -fsS -X POST "$WORKER_BASE_URL/internal/poll" \
  -H 'content-type: application/json' \
  -d '{"options":{"limit":1}}'
```

If `INTERNAL_API_SECRET` is configured, include the internal secret header by reading the value from your local shell or secret store. Do not paste literal secret values into documentation, commits, logs, or issue comments.

## Testing strategy

The test strategy is mock-first and network-isolated.

Expected test coverage includes:

- core dedupe helper tests
- validation tests
- lifecycle transition tests
- DB repository/service tests
- Telegram webhook parsing tests
- manual item creation/reuse tests
- callback routing tests
- provider registry, mock provider, mapper, and failover tests
- poller and batch poller tests
- Firecrawl sandbox provider and route tests with mock HTTP client
- AI output tests with mock provider
- WordPress post builder/client/service tests with mock client
- media processor/preparation tests with mock processor
- Worker route tests
- readiness/auth/logging/rate-limit guard tests
- E2E mock pipeline test

Run all checks:

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

### Cloudflare Worker and Wrangler

`wrangler.toml` defines:

- Worker name: `ai-curation-publisher-agent`
- Worker entrypoint: `apps/worker-api/src/index.ts`
- compatibility date
- local/mock-safe D1 binding named `DB`
- D1 migrations directory
- commented placeholders for future queue/R2 bindings
- mock-safe scheduled trigger

The D1 database ID in `wrangler.toml` is a local/mock-safe placeholder. Replace or override it through environment-specific Cloudflare/Wrangler configuration before production deployment.

### GitHub Actions

The repository includes workflows for:

| Workflow | Purpose |
| --- | --- |
| `ci.yml` | Runs install, lint, typecheck, and tests on pull requests and selected pushes. |
| `deploy-cloudflare.yml` | Manual Worker deploy workflow. Runs validation before deploy. |
| `smoke-test.yml` | Manual smoke workflow for deployed Worker routes. |
| `d1-migrations.yml` | Manual D1 migration workflow. |
| `backup-d1.yml` | Documented backup/export stub. It is not a full production backup implementation. |

### Deployment posture

Manual deployment is recommended until production configuration is complete and verified.

Before deploying:

1. Run `pnpm lint`.
2. Run `pnpm typecheck`.
3. Run `pnpm test`.
4. Apply required D1 migrations.
5. Set required GitHub and Cloudflare secrets.
6. Confirm `/ready` behavior in the target environment.
7. Run smoke checks.
8. Confirm rollback steps.

For the first controlled Cloudflare deployment dry run, use `docs/PRODUCTION_DRY_RUN.md`. The detailed operator runbook remains in `docs/RUNBOOK.md`.

## Configuration and secrets

### Files and secret stores

| Location | Use |
| --- | --- |
| `.env.example` | Sanitized variable names with empty values only. Do not add real values. |
| `.dev.vars` | Local development values only. Do not commit. |
| Cloudflare Worker secrets | Runtime secrets for deployed Worker environments. |
| GitHub Actions secrets | CI/deploy/migration credentials. |

### Runtime configuration names

The README documents names only. Values must be set locally or through secret stores.

Application and internal route protection:

```text
INTERNAL_API_SECRET
```

Telegram:

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_WEBHOOK_SECRET
TELEGRAM_REVIEW_CHAT_ID
TELEGRAM_FINAL_CHAT_ID
```

WordPress:

```text
WORDPRESS_BASE_URL
WORDPRESS_USERNAME
WORDPRESS_APPLICATION_PASSWORD
```

AI:

```text
AI_PROVIDER
AI_API_KEY
```

Providers:

```text
PROVIDERS_MODE
ENABLE_APIFY_PROVIDER
ENABLE_GETXAPI_PROVIDER
ENABLE_FIRECRAWL_PROVIDER
FIRECRAWL_BASE_URL
FIRECRAWL_TIMEOUT_MS
APIFY_TOKEN
GETXAPI_KEY
FIRECRAWL_API_KEY
```

GitHub/Cloudflare operations:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

### Secrets policy

Never commit real values for tokens, secrets, passwords, API keys, webhook secrets, internal API secrets, provider credentials, WordPress application passwords, or private infrastructure identifiers.

Do not add placeholder values that look like credentials. Keep examples to variable names, empty values, or shell/environment variable references.

## Production readiness checklist

Before production rollout, confirm:

- Remote D1 database exists.
- D1 migrations have been applied to the target environment.
- Cloudflare Worker deployment target is configured.
- Cloudflare runtime secrets are set.
- GitHub Actions secrets are set.
- `INTERNAL_API_SECRET` is set for deployed internal routes.
- `/ready` returns ready in the target environment.
- `/health` returns success.
- `/status` returns safe operational status without secrets.
- Mock E2E smoke pipeline passes.
- Real providers remain disabled until an explicit rollout phase enables them.
- Firecrawl sandbox route is disabled unless explicitly needed for a manual direct URL test.
- Logs do not expose raw secret values.
- Rollback path is known and documented.
- Backup/export plan is verified before handling production data.

Use `docs/PRODUCTION_DRY_RUN.md` for the Phase 17 deployment rehearsal checklist and optional Phase 18 Firecrawl sandbox checks.

## Known limitations

Current limitations are intentional and should not be treated as bugs unless a scoped phase changes the expected behavior.

- Real social providers are disabled by default.
- Firecrawl/Web is available only through an explicit, manual, inspect-only sandbox route when enabled.
- No live production scrape automation is enabled by default.
- No real media download or ffmpeg/yt-dlp processing is enabled.
- No real Telegram production bot sending is enabled by default in tests or smoke paths.
- No real WordPress production publishing is enabled by default in tests or smoke paths.
- No dashboard is implemented.
- No durable distributed rate limiting is implemented.
- No monitoring or alerting integration exists yet.
- No production E2E run with real credentials has been completed in this repository state.
- The D1 backup workflow is a documented stub and must be verified before real backup automation.

## Recommended next phases

Recommended next phases should remain small, testable, and reversible.

| Phase | Recommended scope |
| --- | --- |
| Phase 17 | Production configuration and first Cloudflare dry run. Verify remote D1, secrets, `/ready`, `/health`, `/status`, and mock smoke flows in a deployed environment. |
| Phase 18 | Enable one real provider in sandbox. Use one provider, explicit feature flags, controlled credentials, and strict fallback behavior. |
| Phase 19 | Real Telegram bot integration dry run. Verify webhook secret handling, review chat delivery, callback handling, and safe final publish behavior in a controlled environment. |
| Phase 20 | Real WordPress publishing dry run. Verify draft creation only, credential handling, payload mapping, and failure handling. |
| Phase 21 | Scheduler/cron production activation. Enable production polling cadence only after provider, quota, and rollback controls are defined. |
| Phase 22 | Monitoring, quotas, cost controls, and alerting. Add durable rate limiting if needed, cost budgets, operational alerts, and dashboards. |

## Contributor and AI agent rules

These rules apply to both human contributors and AI coding agents working in this repository.

1. Keep phases scoped. Do not combine unrelated rollout, provider, media, publishing, dashboard, or infrastructure changes.
2. Do not add real secrets to the repository.
3. Do not add secret-looking placeholder values.
4. Do not enable real providers by default.
5. Do not make external network calls in tests.
6. Do not bypass dedupe, validation, or lifecycle guards before expensive processing.
7. Prefer provider abstractions over direct third-party API calls.
8. Prefer mock clients/providers/processors in tests.
9. Run `pnpm lint`, `pnpm typecheck`, and `pnpm test` before opening or merging PRs.
10. Update `docs/RUNBOOK.md` for operational behavior changes.
11. Keep `.env.example` sanitized with empty values only.
12. Use Cloudflare secrets and GitHub Actions secrets for runtime/deployment values.
13. Make rollback and failure behavior explicit for production-facing changes.

## Additional documentation

- Production dry-run checklist: `docs/PRODUCTION_DRY_RUN.md`
- Operational runbook: `docs/RUNBOOK.md`
- Implementation plan: `docs/IMPLEMENTATION_PLAN.md`
- Phase task docs: `docs/tasks/`
- Acceptance criteria: `docs/ACCEPTANCE_CRITERIA.md`
