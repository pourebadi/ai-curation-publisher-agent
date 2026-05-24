# AI Curation Publisher Agent

A provider-agnostic social/web content curation, review, and publishing pipeline for Cloudflare Workers, D1, Telegram review, WordPress draft output, and a safe operator dashboard.

The project is mock-first and safety-first. Real providers, scheduler side effects, final Telegram publishing, public WordPress publishing, and real media download/upload are not enabled by default.

## Current status

| Area | Status | Notes |
| --- | --- | --- |
| Worker API | Implemented | Public health/status/readiness routes and protected internal routes. |
| D1 database | Implemented | Core data tables plus Phase 30 admin config/audit tables. |
| Dashboard | Implemented | Admin control panel for status, setup, safe tests, and editable config. |
| Admin config | Implemented | Protected Worker Admin API stores editable config overrides in D1. |
| Secret storage | Implemented | Dashboard-submitted integration secrets are encrypted before D1 storage. |
| Telegram review | Implemented | Review-channel dry-run only unless explicitly configured. No final publish from dashboard. |
| WordPress draft | Implemented | Draft-only dry-run. Public publishing remains blocked. |
| Firecrawl sandbox | Implemented | Explicit sandbox fetch only when backend is configured. |
| Scheduler safeguards | Implemented | Dashboard does not enable scheduler publishing or real provider scheduler access. |
| Public dashboard auth | External | Protect production dashboard with Cloudflare Access or equivalent. |

## Architecture

```text
Dashboard admin user
  -> Dashboard frontend
  -> protected Worker Admin API using x-internal-api-secret
  -> D1 admin_config / admin_config_audit
  -> effective runtime config for status, readiness, and safe dry-run checks
```

Important security boundary: the dashboard frontend does **not** call the Cloudflare API, does **not** receive Cloudflare API tokens, and does **not** directly mutate Cloudflare Worker Secrets. Editable runtime settings go through the protected Worker API and are stored as application-level configuration in D1.

## Phase 30: editable admin config and encrypted secrets

Phase 30 makes the dashboard a real admin control panel for safe runtime configuration.

Admins can edit allowlisted settings from **Dashboard -> Settings** after entering `INTERNAL_API_SECRET` for the current page session. The dashboard does not store that admin secret in `localStorage` or `sessionStorage`; it is kept in memory only until the page reloads.

Non-secret settings are stored as D1 overrides. Secret integration values are encrypted before D1 storage using Web Crypto AES-GCM and a Worker Secret named `CONFIG_ENCRYPTION_KEY`.

Configure the encryption key manually:

```bash
pnpm wrangler secret put CONFIG_ENCRYPTION_KEY
```

Do not commit the generated key. Do not paste it into README, source code, tests, issues, PRs, screenshots, or chat.

If `CONFIG_ENCRYPTION_KEY` is missing or invalid:

- the dashboard can still read public/effective config status
- non-secret dashboard overrides may still be saved
- secret editing is disabled
- readiness reports that config encryption is not ready for secret editing

## New protected admin routes

All admin config routes require `x-internal-api-secret` when `INTERNAL_API_SECRET` is configured.

| Route | Method | Purpose |
| --- | --- | --- |
| `/internal/admin/config` | `GET` | List editable config metadata and safe current status. |
| `/internal/admin/config` | `PUT` | Save one or more allowlisted config values. |
| `/internal/admin/config/reset` | `POST` | Remove one or more D1 dashboard overrides. |
| `/internal/admin/config/audit` | `GET` | Return recent redacted audit entries. |

Secret values are never returned by these routes. Secret items report configured/missing and `valueRedacted` only.

## D1 migration

Phase 30 adds:

- `packages/db/migrations/0030_admin_config.sql`

New tables:

- `admin_config`
- `admin_config_audit`

Audit rows store redacted values only. Plaintext secret values must never be stored in audit.

## Editable settings

Editable non-secret settings:

Telegram:

- `TELEGRAM_REVIEW_CHAT_ID`
- `TELEGRAM_FINAL_CHAT_ID`
- `TELEGRAM_REAL_REVIEW_ENABLED`

WordPress:

- `WORDPRESS_BASE_URL`
- `WORDPRESS_USERNAME`
- `WORDPRESS_DEFAULT_STATUS`
- `WORDPRESS_REAL_DRY_RUN_ENABLED`

Providers:

- `PROVIDERS_MODE`
- `ENABLE_FIRECRAWL_PROVIDER`
- `FIRECRAWL_BASE_URL`
- `FIRECRAWL_TIMEOUT_MS`

Scheduler safety:

- `SCHEDULER_DRY_RUN`
- `SCHEDULER_MAX_SOURCES_PER_RUN`
- `SCHEDULER_MAX_ITEMS_PER_RUN`

Quotas:

- `MAX_AI_ITEMS_PER_RUN`
- `MAX_PROVIDER_ITEMS_PER_RUN`
- `MAX_PUBLISH_ITEMS_PER_RUN`

Editable encrypted integration secrets:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `WORDPRESS_APPLICATION_PASSWORD`
- `FIRECRAWL_API_KEY`
- `APIFY_TOKEN`
- `GETXAPI_KEY`

The dashboard never pre-fills secret inputs. After saving a secret, the input is cleared and the UI shows configured/missing only.

## Protected non-editable settings

These must not be edited from the dashboard:

- `INTERNAL_API_SECRET`
- `CONFIG_ENCRYPTION_KEY`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- D1 database IDs
- deployment credentials
- unknown keys

Set `INTERNAL_API_SECRET` and `CONFIG_ENCRYPTION_KEY` manually as Cloudflare Worker Secrets. Set Cloudflare account/deploy credentials only in GitHub Actions Secrets or Cloudflare, never in frontend code.

## Validation and safety rules

The admin config API validates every write:

- booleans must be exactly `true` or `false`
- URLs must be valid and HTTPS where required
- integers must be within safe min/max ranges
- `WORDPRESS_DEFAULT_STATUS` is restricted to `draft`
- `MAX_PUBLISH_ITEMS_PER_RUN` is restricted to `0`
- forbidden and unknown keys are rejected

The dashboard does not provide controls to enable scheduler publishing, final Telegram publishing, or public WordPress publishing.

## Effective config priority

Runtime config is resolved in this order where Phase 30 is implemented:

1. D1 admin config override
2. Cloudflare Worker environment variable or Worker Secret
3. safe code default

Effective config is used by:

- `/status`
- `/ready`
- Telegram review dry-run
- WordPress draft dry-run
- Firecrawl sandbox fetch
- scheduler safety/manual dry-run summary
- controlled pilot checks

## Dashboard usage

Use the dashboard after the Worker and dashboard are deployed.

1. Open the protected dashboard URL.
2. Enter the Worker API base URL.
3. Enter `INTERNAL_API_SECRET` for this page session.
4. Open **Settings**.
5. Edit safe non-secret values or rotate integration secrets.
6. Configure `CONFIG_ENCRYPTION_KEY` if secret editing is disabled.
7. Run safe pilot checks only after reviewing status.

Production dashboard access should be protected with Cloudflare Access or an equivalent access-control layer. The app itself does not implement a weak shared default password.

## Worker routes

| Route | Purpose | Auth | Real-service behavior |
| --- | --- | --- | --- |
| `GET /health` | Liveness. | None. | No real calls. |
| `GET /status` | Safe effective status summary. | None. | No real calls. |
| `GET /ready` | Safe effective readiness summary. | None. | No real calls. |
| `POST /internal/e2e/mock-pipeline` | Mock smoke flow. | Internal header when configured. | No real external calls. |
| `POST /internal/providers/firecrawl/sandbox-fetch` | Firecrawl sandbox fetch. | Internal header when configured. | Explicit opt-in only. |
| `POST /internal/telegram/review-dry-run` | Telegram review dry-run. | Internal header when configured. | Review only, no final publish. |
| `POST /internal/wordpress/dry-run` | WordPress draft dry-run. | Internal header when configured. | Draft-only. |
| `POST /internal/scheduler/run` | Manual scheduler dry-run. | Internal header when configured. | Dry-run-oriented; no publishing controls. |
| `POST /internal/pilot/real-integrations` | Controlled pilot orchestration. | Internal header when configured. | Only requested/configured steps. |
| `/internal/admin/config*` | Editable admin config. | Internal header when configured. | D1 config only; no Cloudflare API. |

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

Setup and production readiness:

```bash
pnpm setup:cloudflare
WORKER_BASE_URL=https://your-worker-url.example pnpm check:production
```

## Secrets policy

- Real secrets must never be committed.
- Local runtime values go in `.dev.vars`.
- Production runtime secrets go in Cloudflare Worker Secrets.
- CI/deploy secrets go in GitHub Actions Secrets.
- The dashboard must not receive Cloudflare API tokens.
- The dashboard must not mutate Cloudflare Worker Secrets directly.
- Dashboard-submitted integration secrets are encrypted before D1 storage.
- Secret names are okay in docs; secret values are not.

## Production readiness checklist

- [ ] `pnpm lint` passes.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm test` passes.
- [ ] `pnpm dashboard:build` passes.
- [ ] D1 migrations are applied.
- [ ] `INTERNAL_API_SECRET` is configured for deployed internal routes.
- [ ] `CONFIG_ENCRYPTION_KEY` is configured before secret editing.
- [ ] Dashboard is protected with Cloudflare Access or equivalent.
- [ ] Scheduler publishing remains disabled.
- [ ] Final Telegram publishing remains disabled by default.
- [ ] Public WordPress publishing remains disabled by default.
- [ ] No sensitive runtime values appear in logs, responses, docs, tests, or frontend UI.

## Contributor and AI agent rules

1. Keep changes scoped.
2. Do not add real secrets.
3. Do not enable real integrations by default.
4. Do not enable scheduler side effects by default.
5. Do not enable real publishing by default.
6. Do not make real network calls in tests.
7. Do not bypass dedupe, validation, lifecycle, scheduler, auth, redaction, or dashboard safety guards.
8. Do not put Cloudflare API tokens or mutation flows in the dashboard.
9. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm dashboard:build` before opening or merging PRs.
