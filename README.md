# AI Curation Publisher Agent

A provider-agnostic social/web content curation, review, and publishing pipeline for Cloudflare Workers, using mock-safe defaults and opt-in real integrations.

This README is the main source of truth for product owners, maintainers, operators, and AI coding agents working on this repository.

## Executive summary

AI Curation Publisher Agent is a Cloudflare Worker-based backend for collecting public social or web content, normalizing it into a shared content model, deduplicating and validating it before expensive processing, generating AI-assisted publishing outputs, sending content through a human Telegram review flow, and preparing approved content for Telegram and WordPress publishing abstractions.

The product solves a common curation problem: teams want to monitor public content sources, avoid repeatedly processing the same content, keep humans in the approval loop, and publish cleaned-up outputs without coupling the entire system to one provider, AI vendor, messaging API, or CMS implementation.

The current MVP is complete as a controlled, mock-first system. It includes operational routes, local and deployment smoke checks, D1-backed repositories/services, dry-run routes, and a controlled real integrations pilot. It does not enable unattended production automation by default.

Safe default posture:

- mock providers are the default
- real providers are disabled by default
- scheduler side effects are disabled by default
- final Telegram publishing is not enabled by default
- public WordPress publishing is not enabled by default
- media download/upload is not enabled by default
- tests must not make real external calls
- real runtime values must never be committed

At a high level, the system can:

1. ingest manual Telegram text or links
2. poll mock provider sources
3. normalize provider output
4. generate dedupe keys
5. validate raw/normalized content
6. prevent duplicates from entering expensive processing
7. generate AI output through an abstraction
8. create Telegram review drafts
9. handle review callbacks for approve, cancel, and status flows
10. queue approved items for publishing abstractions
11. publish through mock-safe Telegram final publisher abstractions
12. prepare WordPress draft/publish payloads through abstractions
13. run mock E2E smoke checks
14. run controlled, explicit opt-in integration pilots for Firecrawl, Telegram review, and WordPress draft readiness

## Current MVP status

| Area | Status | Notes |
| --- | --- | --- |
| Monorepo/workspace | Implemented | pnpm workspace with apps and packages. |
| Worker API | Implemented | Cloudflare Worker entrypoint exposes public, Telegram, and internal operational routes. |
| D1 database | Implemented | D1 binding and migrations are configured; remote database must be created and migrated by an operator. |
| Core lifecycle | Implemented | Lifecycle guards protect staged transitions. |
| Dedupe | Implemented | Dedupe keys are generated before expensive work. |
| Validation | Implemented | Invalid content is stopped before downstream processing. |
| Manual ingest | Implemented | Telegram/manual text and URL input can create normalized items. |
| AI output | Implemented, mock-safe | AI service and output schemas exist; mock provider is used in tests/default flows. |
| Telegram review | Implemented | Review messages and management buttons are supported. |
| Telegram callbacks | Implemented | Edit/send/cancel/status callback routing is present as scoped handlers/stubs where appropriate. |
| Telegram final publishing abstraction | Implemented, mock default | Final publishing is abstracted and mock-safe by default. |
| WordPress abstraction | Implemented | WordPress client, post builder, output model, service, and real REST client dry-run path exist. |
| Media preparation | Implemented as abstraction | Mock processor supports image/video/carousel preparation metadata. |
| Provider adapters | Implemented | Registry, adapters, mocks, factory, HTTP abstraction, response mapping, and error categories exist. |
| Mock providers | Implemented | Mock Instagram, X, and Web providers are used by default in tests and smoke flows. |
| Firecrawl sandbox | Explicit opt-in | Web/Firecrawl direct URL sandbox exists; real calls are not default. |
| Telegram review dry-run | Explicit opt-in | Real review-channel dry-run can be checked manually when configured. |
| WordPress draft dry-run | Explicit opt-in | Real WordPress dry-run creates drafts only when explicitly enabled and configured. |
| Scheduler safeguards | Implemented | Scheduler is disabled/dry-run guarded by default and does not publish by default. |
| Controlled pilot | Implemented | Combined internal route coordinates Firecrawl, Telegram review, and WordPress draft checks only when explicitly requested. |
| Production readiness | Implemented as safeguards/checks | Health/status/ready routes, internal auth, logging redaction, and runbook-style guidance are represented here. |
| Deployment dry-run support | Implemented | Wrangler config and GitHub workflows support manual deployment and smoke checks. |
| Monitoring/alerts | Not production-integrated | No external monitoring or alerting service is wired. |
| Dashboard | Not implemented | There is no dashboard in the MVP. |

## Implemented vs. mock-only vs. not production-enabled

### Implemented

- core domain models
- lifecycle transition rules
- dedupe helpers and dedupe key generation
- validation helpers
- D1 repositories and services
- manual Telegram ingest
- AI output pipeline and schemas
- Telegram review flow
- Telegram callback flow
- publishing queue abstractions
- Telegram publishing abstraction
- WordPress client abstraction and post builder
- WordPress REST client for explicit dry-run draft checks
- media asset model and mock media processor
- provider registry, factory, adapters, and mock providers
- mock source polling
- scheduler safeguards and quota/cost-control foundations
- Worker operational routes
- internal route protection
- readiness and status routes
- GitHub Actions workflows for CI, deploy, smoke, migrations, and backup stub
- E2E mock smoke scenario
- controlled real integrations pilot

### Mock or dry-run by default

- AI provider
- Telegram client
- WordPress client
- provider polling
- media processor
- E2E mock pipeline
- Firecrawl sandbox
- Telegram review dry-run
- WordPress draft dry-run
- controlled real integrations pilot

### Not production-enabled by default

- real provider polling
- scheduler side effects
- final Telegram public publishing
- public WordPress publishing
- automatic publishing
- real media download
- real media upload
- dashboard
- external monitoring or alerting
- durable quota tracking
- durable distributed rate limiting

## Architecture overview

```text
User / Operator
  |
  v
Cloudflare Worker (apps/worker-api)
  |
  +-- Public health/readiness/status routes
  +-- Telegram webhook route
  +-- Protected internal operational routes
  |
  v
Core lifecycle / validation / dedupe (packages/core)
  |
  +-- Provider layer (packages/providers)
  |     +-- mock providers by default
  |     +-- real provider stubs behind explicit config
  |
  +-- AI layer (packages/ai)
  |     +-- mock AI provider by default
  |
  +-- Telegram layer (packages/telegram)
  |     +-- review message builder
  |     +-- callback handling support
  |     +-- mock and real-client abstractions
  |
  +-- Publishing queue / services (packages/db and service packages)
  |
  +-- WordPress layer (packages/wordpress)
  |     +-- post builder
  |     +-- mock client
  |     +-- explicit dry-run REST client
  |
  +-- Media layer (packages/media)
        +-- media metadata and mock preparation

D1 repositories/services (packages/db)
  |
  v
Cloudflare D1
```

### Package structure

| Path | Owns |
| --- | --- |
| `apps/worker-api` | Worker entrypoint, routes, operational handlers, scheduled handler, internal auth usage, readiness/status responses. |
| `packages/core` | Shared types, lifecycle, validation, dedupe, normalization helpers, stable hashing. |
| `packages/db` | D1 repositories, migrations, persistence-oriented services, ingest gate, publishing queue integration. |
| `packages/providers` | Provider adapter interface, mock providers, real provider stubs, provider registry/factory, HTTP client abstraction, response mappers, pollers. |
| `packages/ai` | AI provider abstraction, mock AI provider, prompt rendering, Telegram and WordPress output structures. |
| `packages/telegram` | Telegram parsing, review formatting, inline button models, mock/real client abstractions. |
| `packages/wordpress` | WordPress output model, post payload builder, mock client, REST client, publishing service. |
| `packages/media` | Media asset types, media preparation service, mock processor, image/video/carousel metadata. |
| `.github/workflows` | CI, manual Cloudflare deploy, smoke test, D1 migrations, backup/export stub. |

## Main data flows

### Manual Telegram flow

```text
Telegram/manual input
  -> Telegram webhook route
  -> manual ingest handler
  -> normalize text or URL
  -> validate source/content
  -> generate dedupe keys
  -> lifecycle transition
  -> AI output generation
  -> Telegram review message
  -> callback approve/cancel/status
  -> queue for publish
  -> final Telegram publishing abstraction
  -> WordPress abstraction if invoked by service flow
```

The important guardrail is that validation and dedupe happen before expensive processing. A duplicate or invalid item must not proceed to AI, media work, review, or publishing.

### Provider polling flow

```text
source config
  -> provider registry
  -> provider priority/fallback selection
  -> source poller
  -> normalized posts
  -> ingest gate
  -> dedupe and validation
  -> downstream processing
```

Mock providers are the default. Real providers are represented behind explicit configuration and are not automatically used by production scheduler behavior.

### E2E mock smoke flow

```text
mock source
  -> mock provider
  -> normalized post
  -> ingest gate
  -> mock AI
  -> mock Telegram review
  -> simulated approval
  -> publish queue
  -> mock final Telegram publish
  -> mock WordPress publish
  -> structured smoke result
```

This verifies orchestration without external calls.

### Controlled real integrations pilot flow

```text
readiness/config summary
  -> optional Firecrawl sandbox fetch
  -> optional Telegram review dry-run
  -> optional WordPress draft dry-run
  -> no scheduler activation
  -> no final Telegram publishing
  -> no public WordPress publishing
```

The default request body is `{}` and returns readiness/configuration summary only.

## Lifecycle and statuses

The item lifecycle is intentionally staged so expensive or public actions are gated.

| Status | Purpose |
| --- | --- |
| `discovered` | Raw candidate was found or received. |
| `normalized` | Candidate was converted into the shared normalized shape. |
| `validated` | Candidate passed validation rules. |
| `queued_for_ai` | Valid, deduped item is eligible for AI processing. |
| `ai_processed` | AI output has been created. |
| `sent_to_review` | Review draft was sent to the review surface. |
| `approved` | Human reviewer approved the item. |
| `queued_for_publish` | Approved item is queued for publishing abstraction. |
| `published` | Publishing abstraction completed successfully. |
| `duplicate_skipped` | Duplicate was detected and skipped before costly work. |
| `invalid` | Validation failed; item must not proceed. |
| `failed` | Processing failed in a recoverable or terminal path depending on context. |
| `cancelled` | Human reviewer cancelled the item. |

Rules:

- no AI before dedupe and validation
- duplicates are skipped before costly processing
- invalid content never proceeds downstream
- approval gates publishing
- public publishing is not enabled by default

## Dedupe system

Dedupe exists to prevent repeated AI calls, repeated media processing, duplicate review messages, and duplicate publishing.

Key helpers:

| Helper | Purpose |
| --- | --- |
| `stableHash(value)` | Produces stable hash values for dedupe and IDs. |
| `normalizeText(value)` | Normalizes text for text-based duplicate detection. |
| `normalizeCanonicalUrl(value)` | Canonicalizes URLs for URL-based dedupe. |
| `hashCanonicalUrl(value)` | Hashes canonical URLs. |
| `hashNormalizedText(value)` | Hashes normalized text. |
| `hashMediaUrl(value)` | Hashes media URLs where available. |
| `createStableId(prefix, seed)` | Creates deterministic IDs for testable flows. |
| `createFallbackCompositeKey(post)` | Builds a fallback dedupe key when stronger identifiers are absent. |
| `generateDedupeKeys(post)` | Generates all supported dedupe keys for a normalized post. |

Supported dedupe key types:

| Key type | Meaning |
| --- | --- |
| `platform_source_post_id` | Exact platform + source post identity. |
| `canonical_url_hash` | URL-based identity. |
| `normalized_text_hash` | Text-based identity. |
| `media_url_hash` | Media URL identity where present. |
| `fallback_composite` | Last-resort composite identity from available source/post fields. |

Dedupe happens before AI, media, review, and publishing. That is a cost-control rule, not a nice-to-have.

## Validation system

Validation prevents malformed, unsupported, or contentless items from entering expensive processing.

Validation checks include:

- canonical URL presence where required
- allowed URL schemes
- valid platform
- valid source type
- source identity or fallback identity
- text, media, or link availability
- enough normalized content to justify downstream processing

Invalid items are marked invalid and do not proceed to AI, media preparation, review, queueing, or publishing.

## Provider system

The provider layer prevents the core application from depending directly on a third-party response shape.

Provider responsibilities:

- identify provider ID/name
- declare platform
- declare supported source types
- perform health checks
- fetch recent posts for source definitions
- fetch direct URLs where supported
- return shared `NormalizedPost` output
- classify failures with typed provider errors

Implemented provider concepts:

- provider adapter interface
- provider registry
- provider priority/fallback behavior
- provider factory
- provider runtime configuration
- mock Instagram provider
- mock X/Twitter provider
- mock Web provider
- Apify-style Instagram stub
- GetXAPI-style X/Twitter stub
- Firecrawl/Web provider
- provider HTTP client abstraction
- mock HTTP client
- fetch-based HTTP client implementation
- response mappers for provider payloads
- provider error categories
- failover metadata readiness

Provider error categories include disabled providers, missing credentials, unsupported source types, rate limiting, timeout, network errors, HTTP errors, invalid responses, provider errors, and unknown errors.

Provider-related environment names:

| Name | Purpose |
| --- | --- |
| `PROVIDERS_MODE` | Controls mock/mixed/real provider mode. Mock is the safe default. |
| `ENABLE_APIFY_PROVIDER` | Enables Apify-style provider stub when explicitly configured. |
| `ENABLE_GETXAPI_PROVIDER` | Enables GetXAPI-style provider stub when explicitly configured. |
| `ENABLE_FIRECRAWL_PROVIDER` | Enables Firecrawl/Web provider when explicitly configured. |
| `APIFY_TOKEN` | Runtime credential name for Apify-style provider. |
| `GETXAPI_KEY` | Runtime credential name for GetXAPI-style provider. |
| `FIRECRAWL_API_KEY` | Runtime credential name for Firecrawl/Web provider. |
| `FIRECRAWL_BASE_URL` | Optional Firecrawl-compatible base URL override. |
| `FIRECRAWL_TIMEOUT_MS` | Optional timeout setting for Firecrawl-compatible calls. |

No real provider credentials are required for tests or mock mode.

## AI pipeline

The AI layer is provider-agnostic. The current MVP has mock-safe defaults and separates output targets.

Implemented concepts:

- AI provider abstraction
- mock AI provider
- prompt rendering
- Telegram output schema
- WordPress output schema
- target-specific output generation
- tests that do not require real AI credentials

AI-related environment names:

| Name | Purpose |
| --- | --- |
| `AI_PROVIDER` | Selects AI provider in future/explicitly configured runtime paths. |
| `AI_API_KEY` | Runtime credential name for real AI provider access. |

Real AI calls are not required for tests.

## Telegram pipeline

Telegram is both a manual ingest surface and a review/control surface.

Implemented concepts:

- Telegram webhook route
- manual text ingest
- manual URL ingest
- review message formatting
- inline keyboard buttons
- callback handling for edit/send/cancel/status paths
- approval/cancel/status behavior
- review dry-run operation
- mock Telegram client default
- real Telegram client behind explicit opt-in/configuration
- final Telegram publishing abstraction

Review management buttons include:

- Edit
- Send
- Cancel
- Status

The Send callback approves or advances the item within the scoped review/publishing flow. Real final channel publishing is not enabled by default.

Telegram-related environment names:

| Name | Purpose |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Runtime credential name for Telegram Bot API access. Secret. |
| `TELEGRAM_WEBHOOK_SECRET` | Runtime secret name for webhook verification where used. Secret. |
| `TELEGRAM_REVIEW_CHAT_ID` | Review chat/channel identifier. Treat as sensitive operational config. |
| `TELEGRAM_FINAL_CHAT_ID` | Final channel identifier. Treat as sensitive operational config. |
| `TELEGRAM_ALLOWED_REVIEWER_IDS` | Optional reviewer allowlist configuration. Treat as sensitive operational config. |
| `TELEGRAM_REAL_REVIEW_ENABLED` | Explicit flag for real review dry-run behavior. |

Never commit Telegram tokens, webhook secrets, chat IDs, or reviewer IDs.

## WordPress pipeline

The WordPress layer is separate from Telegram output. WordPress content can be longer, structured differently, and remain draft-only during dry-run checks.

Implemented concepts:

- WordPress output model
- post payload builder
- mock WordPress client
- WordPress client interface
- real WordPress REST client
- publishing service
- draft-only dry-run operation
- status/default-status handling
- structured error classification

WordPress dry-run behavior:

- mock client is used by default in tests/local mock paths
- real REST client is explicit opt-in
- real dry-run creates drafts only
- public publishing is not enabled by default
- media upload is not part of the current MVP

WordPress-related environment names:

| Name | Purpose |
| --- | --- |
| `WORDPRESS_BASE_URL` | Runtime site base URL for real dry-run checks. |
| `WORDPRESS_USERNAME` | Runtime username for WordPress REST authentication. Sensitive operational config. |
| `WORDPRESS_APPLICATION_PASSWORD` | Runtime application password for WordPress REST authentication. Secret. |
| `WORDPRESS_DEFAULT_STATUS` | Default requested WordPress status; MVP dry-run should remain draft-oriented. |
| `WORDPRESS_REAL_DRY_RUN_ENABLED` | Explicit flag for real WordPress draft dry-run behavior. |

Never commit WordPress usernames or application passwords.

## Media pipeline

The media package represents and prepares media metadata without requiring production downloads in tests.

Supported concepts:

- image assets
- video assets
- thumbnail metadata
- carousel/multi-media groups
- source URL and canonical URL
- local path or storage key metadata
- MIME type metadata
- size metadata
- duration metadata for video
- width/height metadata where available
- processing statuses

Media processing statuses:

- `pending`
- `ready`
- `failed`
- `skipped`

The mock media processor supports deterministic image/video/carousel preparation, thumbnail metadata, and failure reporting. Carousel media remains grouped under the same content item and is not split into separate content items.

Not enabled by default:

- real media download
- real yt-dlp execution
- real ffmpeg execution
- real R2 upload
- real Telegram media sending
- real WordPress media upload

## Scheduler and operations safeguards

The scheduler exists but is guarded. The MVP does not run production automation by default.

Defaults:

- scheduler disabled by default
- dry-run behavior by default
- mock providers only by default
- no publishing by default
- conservative source/item limits
- quota/cost-control variables exist as foundations

Scheduler-related environment names:

| Name | Purpose |
| --- | --- |
| `SCHEDULER_ENABLED` | Enables scheduler operation when explicitly configured. Default behavior is disabled. |
| `SCHEDULER_DRY_RUN` | Keeps scheduler in dry-run mode. Safe default is dry-run. |
| `SCHEDULER_MAX_SOURCES_PER_RUN` | Limits number of sources per scheduler run. |
| `SCHEDULER_MAX_ITEMS_PER_RUN` | Limits number of items per scheduler run. |
| `SCHEDULER_ALLOW_REAL_PROVIDERS` | Allows real providers only when explicitly configured. |
| `SCHEDULER_ALLOW_PUBLISHING` | Allows publishing only when explicitly configured. MVP should keep this disabled. |
| `MAX_AI_ITEMS_PER_RUN` | Cost-control foundation for AI work. |
| `MAX_PROVIDER_ITEMS_PER_RUN` | Cost-control foundation for provider results. |
| `MAX_PUBLISH_ITEMS_PER_RUN` | Cost-control foundation for publish work. |

Manual scheduler route:

```text
POST /internal/scheduler/run
```

This route can run a dry-run manually. It must not be confused with launch automation.

## Worker routes

### Public/basic routes

| Route | Purpose | Auth | Real services? | Default safety behavior |
| --- | --- | --- | --- | --- |
| `GET /` | Alias for health. | None. | No. | Liveness only. |
| `GET /health` | Basic liveness check. | None. | No. | Returns service health metadata. |
| `GET /status` | Safe operational status. | None. | No. | Exposes booleans and summaries only, no secret values. |
| `GET /ready` | Readiness/config validation summary. | None. | No. | Local/mock can pass with warnings; production may fail missing required config. |

### Telegram route

| Route | Purpose | Auth | Real services? | Default safety behavior |
| --- | --- | --- | --- | --- |
| `POST /telegram/webhook` | Receives Telegram webhook updates for manual ingest and callbacks. | Telegram/webhook verification where configured. | Can process inbound Telegram-originated requests. | Does not enable final publishing by default. |

### Internal routes

Internal routes are protected when `INTERNAL_API_SECRET` is configured.

| Route | Purpose | Auth | Real services? | Default safety behavior |
| --- | --- | --- | --- | --- |
| `POST /internal/poll` | Runs mock-safe provider polling. | Internal header when configured. | Mock by default. | Uses mock providers unless future config explicitly changes behavior. |
| `POST /internal/publish/telegram` | Triggers mock-safe Telegram publish service. | Internal header when configured. | Mock by default. | Does not require real Telegram Bot API in tests/default. |
| `POST /internal/e2e/mock-pipeline` | Runs mock E2E smoke scenario. | Internal header when configured. | No real calls. | Exercises full mock flow only. |
| `POST /internal/providers/firecrawl/sandbox-fetch` | Runs explicit Firecrawl/Web inspect-only sandbox fetch. | Internal header when configured. | Only when explicitly enabled/configured. | Does not enqueue, publish, or process media. |
| `POST /internal/telegram/review-dry-run` | Sends/validates Telegram review dry-run. | Internal header when configured. | Only when explicitly enabled/configured. | Review channel only; no final channel publish. |
| `POST /internal/wordpress/dry-run` | Builds or creates WordPress draft dry-run. | Internal header when configured. | Only when explicitly enabled/configured. | Draft-only; no public publish. |
| `POST /internal/scheduler/run` | Runs manual scheduler dry-run. | Internal header when configured. | Mock-safe by default. | No publishing by default. |
| `POST /internal/pilot/real-integrations` | Coordinates controlled pilot readiness and optional dry-run checks. | Internal header when configured. | Only requested/configured steps. | Default `{}` does readiness summary only. |

### Example internal request

If internal route protection is configured, include the header from your shell or secret store:

```bash
curl -fsS -X POST "$WORKER_BASE_URL/internal/pilot/real-integrations" \
  -H "content-type: application/json" \
  -H "x-internal-api-secret: $INTERNAL_API_SECRET" \
  -d '{}'
```

Do not paste the internal secret value into commits, docs, logs, or screenshots.

## Internal route protection

Runtime name:

```text
INTERNAL_API_SECRET
```

Header name:

```text
x-internal-api-secret
```

Behavior:

- local/mock mode may leave the internal secret unset for development and tests
- deployed environments should configure the internal secret
- when configured, protected internal routes reject missing or invalid headers
- responses must not echo the configured value
- logs must not contain the configured value

## Configuration reference

Do not put values in this table. It intentionally lists names only.

| Variable | Where to set | Secret? | Purpose | Default/safety note |
| --- | --- | --- | --- | --- |
| `ENVIRONMENT` | `.dev.vars`, Cloudflare vars | No | Runtime environment label. | Local/mock can use non-production behavior. |
| `LOG_LEVEL` | `.dev.vars`, Cloudflare vars | No | Logging verbosity. | Debug is useful locally; avoid noisy production logs. |
| `INTERNAL_API_SECRET` | `.dev.vars`, Cloudflare secrets | Yes | Protects internal routes. | If unset, local/dev routes can remain accessible. |
| `PROVIDERS_MODE` | `.dev.vars`, Cloudflare vars | No | Provider mode selection. | Mock is the safe default. |
| `ENABLE_APIFY_PROVIDER` | `.dev.vars`, Cloudflare vars | No | Enables Apify-style provider stub. | Disabled unless explicitly configured. |
| `ENABLE_GETXAPI_PROVIDER` | `.dev.vars`, Cloudflare vars | No | Enables GetXAPI-style provider stub. | Disabled unless explicitly configured. |
| `ENABLE_FIRECRAWL_PROVIDER` | `.dev.vars`, Cloudflare vars | No | Enables Firecrawl/Web provider. | Disabled unless explicitly configured. |
| `APIFY_TOKEN` | `.dev.vars`, Cloudflare secrets | Yes | Apify-style provider credential. | Not required for mock mode. |
| `GETXAPI_KEY` | `.dev.vars`, Cloudflare secrets | Yes | GetXAPI-style provider credential. | Not required for mock mode. |
| `FIRECRAWL_API_KEY` | `.dev.vars`, Cloudflare secrets | Yes | Firecrawl/Web provider credential. | Not required unless running Firecrawl sandbox. |
| `FIRECRAWL_BASE_URL` | `.dev.vars`, Cloudflare vars | No | Optional Firecrawl-compatible endpoint override. | Default behavior should remain provider-safe. |
| `FIRECRAWL_TIMEOUT_MS` | `.dev.vars`, Cloudflare vars | No | Optional Firecrawl timeout. | Used only for explicit provider path. |
| `AI_PROVIDER` | `.dev.vars`, Cloudflare vars | No | AI provider selection. | Mock-safe by default in tests. |
| `AI_API_KEY` | `.dev.vars`, Cloudflare secrets | Yes | Real AI credential. | Not required for tests. |
| `TELEGRAM_BOT_TOKEN` | `.dev.vars`, Cloudflare secrets | Yes | Telegram Bot API credential. | Not required for mock tests. |
| `TELEGRAM_WEBHOOK_SECRET` | `.dev.vars`, Cloudflare secrets | Yes | Telegram webhook verification secret where used. | Do not expose in responses/logs. |
| `TELEGRAM_REVIEW_CHAT_ID` | `.dev.vars`, Cloudflare secrets or vars depending policy | Treat as sensitive | Review chat/channel target. | Required for real review dry-run. |
| `TELEGRAM_FINAL_CHAT_ID` | `.dev.vars`, Cloudflare secrets or vars depending policy | Treat as sensitive | Final Telegram channel target. | Final publish is not enabled by default. |
| `TELEGRAM_ALLOWED_REVIEWER_IDS` | `.dev.vars`, Cloudflare secrets or vars depending policy | Treat as sensitive | Optional reviewer allowlist. | Do not commit. |
| `TELEGRAM_REAL_REVIEW_ENABLED` | `.dev.vars`, Cloudflare vars | No | Enables explicit real review dry-run. | Disabled unless intentionally set. |
| `WORDPRESS_BASE_URL` | `.dev.vars`, Cloudflare vars or secrets depending policy | Treat as sensitive operational config | WordPress site base URL. | Required for real WordPress dry-run. |
| `WORDPRESS_USERNAME` | `.dev.vars`, Cloudflare secrets | Yes | WordPress REST username. | Do not expose. |
| `WORDPRESS_APPLICATION_PASSWORD` | `.dev.vars`, Cloudflare secrets | Yes | WordPress REST application password. | Do not expose. |
| `WORDPRESS_DEFAULT_STATUS` | `.dev.vars`, Cloudflare vars | No | Requested WordPress status. | MVP dry-run should remain draft-oriented. |
| `WORDPRESS_REAL_DRY_RUN_ENABLED` | `.dev.vars`, Cloudflare vars | No | Enables explicit real WordPress draft dry-run. | Disabled unless intentionally set. |
| `SCHEDULER_ENABLED` | `.dev.vars`, Cloudflare vars | No | Enables scheduler operation. | Disabled by default. |
| `SCHEDULER_DRY_RUN` | `.dev.vars`, Cloudflare vars | No | Keeps scheduler in dry-run mode. | Dry-run is the safe default. |
| `SCHEDULER_MAX_SOURCES_PER_RUN` | `.dev.vars`, Cloudflare vars | No | Scheduler source limit. | Conservative limits reduce accidental spend. |
| `SCHEDULER_MAX_ITEMS_PER_RUN` | `.dev.vars`, Cloudflare vars | No | Scheduler item limit. | Conservative limits reduce accidental spend. |
| `SCHEDULER_ALLOW_REAL_PROVIDERS` | `.dev.vars`, Cloudflare vars | No | Allows scheduler to use real providers in future scoped rollout. | Disabled by default. |
| `SCHEDULER_ALLOW_PUBLISHING` | `.dev.vars`, Cloudflare vars | No | Allows scheduler publishing in future scoped rollout. | Disabled by default. |
| `MAX_AI_ITEMS_PER_RUN` | `.dev.vars`, Cloudflare vars | No | AI cost-control foundation. | Keep conservative. |
| `MAX_PROVIDER_ITEMS_PER_RUN` | `.dev.vars`, Cloudflare vars | No | Provider result cost-control foundation. | Keep conservative. |
| `MAX_PUBLISH_ITEMS_PER_RUN` | `.dev.vars`, Cloudflare vars | No | Publish cost-control foundation. | Keep zero unless explicitly scoped. |
| `CLOUDFLARE_API_TOKEN` | GitHub Actions secrets | Yes | Workflow deploy/migration authentication. | Used by GitHub workflows only. |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub Actions secrets | Yes | Cloudflare account identifier for workflows. | Used by GitHub workflows only. |

## Secrets policy

Never commit real secrets.

Rules:

- local runtime values go in `.dev.vars`
- deployed runtime secrets go in Cloudflare Worker Secrets
- CI/deploy secrets go in GitHub Actions Secrets
- `.env.example` must contain empty values only
- secret names are allowed in docs
- secret values are never allowed in docs, code, tests, workflows, comments, screenshots, or logs
- do not add fake token-looking placeholders
- do not log request headers wholesale
- do not expose runtime values in `/status` or `/ready`
- if a dashboard is added in the future, it must not expose secrets

## Local development

Requirements:

- Node.js 22 or newer
- pnpm 9.15.4 via Corepack
- Wrangler through project dependencies

Install:

```bash
corepack enable
corepack prepare pnpm@9.15.4 --activate
pnpm install
```

Run checks:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Run Worker locally:

```bash
pnpm worker:dev
```

Local migrations:

```bash
pnpm d1:migrate:local
```

Remote migrations:

```bash
pnpm d1:migrate:remote
```

Deploy manually:

```bash
pnpm worker:deploy
```

Local smoke checks:

```bash
WORKER_BASE_URL=http://localhost:8787 pnpm worker:health
WORKER_BASE_URL=http://localhost:8787 pnpm worker:smoke
WORKER_BASE_URL=http://localhost:8787 pnpm worker:e2e:mock
```

Scripts currently defined in `package.json`:

| Script | Purpose |
| --- | --- |
| `pnpm build` | Runs workspace build through Turbo. |
| `pnpm lint` | Runs the repository lint script. |
| `pnpm typecheck` | Runs TypeScript project references. |
| `pnpm test` | Runs Vitest. |
| `pnpm dev` | Starts Worker dev through the worker package. |
| `pnpm worker:dev` | Starts local Worker dev. |
| `pnpm worker:deploy` | Runs Wrangler deploy. |
| `pnpm worker:health` | Calls `/health` on `WORKER_BASE_URL` or local default. |
| `pnpm worker:smoke` | Calls `/health` and `/status`. |
| `pnpm worker:e2e:mock` | Calls mock E2E pipeline route. |
| `pnpm db:migrate:local` | Applies local D1 migrations. |
| `pnpm d1:migrate:local` | Alias for local D1 migrations. |
| `pnpm d1:migrate:remote` | Applies remote D1 migrations. |

No scheduler or pilot package scripts exist at the time of this README. Use curl commands for those routes.

## Testing strategy

Test layers include:

- package unit tests
- route tests
- operation tests
- repository/service tests
- provider mapper tests
- mock E2E smoke route tests

Rules:

- no real external calls in tests
- no real provider credentials in tests
- no real Telegram Bot API calls in tests
- no real WordPress REST calls in tests
- no real media download, ffmpeg, or yt-dlp execution in tests
- use mock providers and mock clients
- keep TypeScript `exactOptionalPropertyTypes` discipline in mind: omit optional fields instead of passing `undefined` when types require omission

Common troubleshooting:

- If a route test fails, check method/auth handling first.
- If a redaction test fails, make sure assertions check runtime values, not words that appear in field names.
- If provider tests fail, verify mock provider priority and injected mock HTTP clients.
- If WordPress or Telegram tests fail, confirm the mock client is used and no real fetch path is invoked.
- If typecheck fails on optional properties, prefer conditional object spreads over assigning `undefined`.

## Cloudflare deployment

The Worker is configured through `wrangler.toml`:

- Worker name: `ai-curation-publisher-agent`
- Worker entrypoint: `apps/worker-api/src/index.ts`
- D1 binding: `DB`
- D1 migrations directory: `packages/db/migrations`
- Workers.dev enabled
- scheduled trigger present, guarded by scheduler config and mock-safe defaults

Deployment is intentionally manual unless a future scoped phase changes it.

Manual deploy:

```bash
pnpm worker:deploy
```

GitHub workflows:

| Workflow | Purpose |
| --- | --- |
| `CI` | Runs install, lint, typecheck, and tests. |
| `Deploy Cloudflare Worker` | Manual workflow that validates then deploys Worker. |
| `Worker Smoke Test` | Manual smoke test against a deployed Worker URL. |
| `Apply D1 Migrations` | Manual local/remote D1 migration workflow. |
| `Backup D1 Stub` | Documented backup/export placeholder; verify Cloudflare export support before enabling real backups. |

Deployment sequence:

1. Ensure CI is green.
2. Configure Cloudflare runtime settings and secrets outside the repository.
3. Configure GitHub Actions secrets for deployment.
4. Apply D1 migrations to the intended target.
5. Deploy manually.
6. Check `/health`.
7. Check `/status`.
8. Check `/ready`.
9. Run mock smoke checks.
10. Run controlled pilot readiness-only check.
11. Review logs for errors and secret exposure.

Rollback basics:

- redeploy a previous known-good commit
- revert the PR and redeploy
- disable any explicit integration enablement flags
- return provider mode to mock
- keep scheduler disabled or dry-run guarded
- keep publishing disabled
- treat D1 rollback as conservative and manual

## D1 database

D1 stores operational state for sources, items, dedupe keys, outputs, review metadata, publish queue records, media metadata, and related repositories/services where implemented.

Local migration command:

```bash
pnpm d1:migrate:local
```

Remote migration command:

```bash
pnpm d1:migrate:remote
```

Migration rules:

- prefer additive migrations
- avoid destructive migrations without explicit backup and rollback planning
- apply remote migrations intentionally
- verify `/health`, `/status`, and `/ready` after migration
- do not commit production exports or backups
- backup/export automation is still a documented stub, not a fully verified production backup system

## Controlled real integrations pilot

Route:

```text
POST /internal/pilot/real-integrations
```

Default readiness-only request:

```bash
curl -fsS -X POST "$WORKER_BASE_URL/internal/pilot/real-integrations" \
  -H "content-type: application/json" \
  -H "x-internal-api-secret: $INTERNAL_API_SECRET" \
  -d '{}'
```

Default behavior:

- returns readiness/config summary
- Firecrawl step is skipped
- Telegram review step is skipped
- WordPress draft step is skipped
- no scheduler activation
- no final Telegram publishing
- no public WordPress publishing
- no downstream enqueue/publish

Example combined pilot request:

```bash
curl -fsS -X POST "$WORKER_BASE_URL/internal/pilot/real-integrations" \
  -H "content-type: application/json" \
  -H "x-internal-api-secret: $INTERNAL_API_SECRET" \
  -d '{"runFirecrawl":true,"runTelegramReview":true,"runWordPressDraft":true,"firecrawlUrl":"https://example.com/article","telegramText":"Review dry-run content","wordpressTitle":"Dry-run title","wordpressContent":"Dry-run content","sourceUrl":"https://example.com/source"}'
```

Expected safety behavior:

- only requested steps run
- Firecrawl remains sandbox/inspect-only
- Telegram sends review dry-run only when explicitly enabled/configured
- WordPress creates draft only when explicitly enabled/configured
- scheduler is not activated
- final Telegram channel publishing is not triggered
- public WordPress publishing is not triggered
- media upload/download is not triggered
- one failed step does not hide other step statuses
- response must not expose runtime secret values

## Production readiness checklist

Before any MVP launch decision:

- [ ] `main` is green.
- [ ] `pnpm lint` passes.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm test` passes.
- [ ] Worker boots locally.
- [ ] Local `/health` passes.
- [ ] Local `/status` passes.
- [ ] Local `/ready` passes.
- [ ] Local mock E2E smoke passes.
- [ ] Remote D1 database exists.
- [ ] D1 migrations are applied to the intended target.
- [ ] Cloudflare runtime secrets are configured outside the repository.
- [ ] GitHub Actions secrets are configured outside the repository.
- [ ] Worker deploys manually.
- [ ] Deployed `/health` passes.
- [ ] Deployed `/status` passes.
- [ ] Deployed `/ready` passes.
- [ ] Internal route protection is configured and tested.
- [ ] Controlled pilot readiness-only check passes.
- [ ] Scheduler remains disabled or dry-run guarded.
- [ ] Real providers remain disabled unless explicitly piloted.
- [ ] Final Telegram publishing remains disabled by default.
- [ ] Public WordPress publishing remains disabled by default.
- [ ] Rollback approach is understood.
- [ ] Logs and responses do not expose runtime values.

## Launch / no-launch criteria

Launch only if:

- CI is green
- local and deployed readiness checks pass
- D1 migration status is known
- internal route auth works in the deployed environment
- mock E2E smoke passes
- controlled pilot readiness-only check passes
- any real dry-run was intentional, scoped, and disabled after verification
- scheduler safeguards are confirmed
- no public publish path is enabled without explicit approval
- rollback path is known

Do not launch if:

- `/ready` has production errors
- secrets are missing or uncertain
- D1 migration status is uncertain
- controlled pilot fails unexpectedly
- internal auth guard fails
- any unexpected real external call occurs
- logs or responses expose sensitive runtime information
- scheduler is enabled unintentionally
- final Telegram publishing is enabled unintentionally
- public WordPress publishing is enabled unintentionally
- rollback steps are unclear

## Known limitations

- No dashboard is implemented.
- No external monitoring or alerting service is integrated.
- No durable quota dashboard exists.
- Durable distributed rate limiting is not implemented.
- Production media download/upload is not enabled by default.
- Real provider rollout is not automatic.
- Public WordPress publishing is not automatic.
- Final Telegram publishing is not automatic.
- Scheduler side effects are disabled by default.
- Operator must configure Cloudflare resources and runtime secrets.
- Backup/export workflow is a documented stub until verified against current Cloudflare tooling.
- Real end-to-end public publish requires a future scoped rollout and explicit approval.

## Contributor and AI agent rules

1. Keep changes scoped.
2. Do not add real secrets.
3. Do not add fake credential-looking placeholders.
4. Do not enable real integrations by default.
5. Do not enable scheduler side effects by default.
6. Do not enable real publishing by default.
7. Do not make real network calls in tests.
8. Run `pnpm lint`, `pnpm typecheck`, and `pnpm test` before opening or merging PRs.
9. Update this README if operational behavior changes.
10. Prefer abstractions over direct third-party calls.
11. Never bypass dedupe or validation before costly processing.
12. Do not delete lifecycle, validation, dedupe, scheduler, auth, redaction, or pilot safety guards.
13. Do not log raw headers, tokens, passwords, API keys, application passwords, webhook secrets, internal secrets, or provider credentials.
14. If a future dashboard is added, it must respect the same redaction and access-control rules.

## Markdown documentation consolidation

This README consolidates the useful product, technical, operations, MVP status, launch checklist, and AI-agent guidance that previously lived in separate Markdown files.

Historical phase prompt Markdown files and redundant docs were removed so this README remains the single source of truth for the completed MVP.
