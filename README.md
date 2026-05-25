# AI Curation Publisher Agent

A provider-agnostic social/web content curation, review, and draft-publishing pipeline for Cloudflare Workers, D1, Telegram review, WordPress drafts, and a safe operator dashboard.

The project is mock-first and safety-first. Real providers, scheduler side effects, final Telegram publishing, public WordPress publishing, and real media download/upload are not enabled by default.

## Phase 30 Admin Control Center

Phase 30 turns the dashboard into an Admin Control Center for non-technical operators. It supports setup guidance, safe settings, operating modes, AI configuration, encrypted integration credentials, pilot tests, launch readiness, and recent-change audit review.

The dashboard architecture is intentionally narrow:

```text
Dashboard
  -> protected Worker Admin API
  -> D1 admin_config store
  -> encrypted D1 values for selected credentials
  -> Worker effective runtime config
```

The dashboard does not call the Cloudflare API, does not receive Cloudflare API tokens, and does not directly mutate Cloudflare Worker Secrets. Cloudflare Worker Secrets remain for bootstrap/system secrets only.

## Bootstrap secrets

These are not editable from the dashboard:

- `INTERNAL_API_SECRET`
- `CONFIG_ENCRYPTION_KEY`

Configure `CONFIG_ENCRYPTION_KEY` manually before using dashboard secret editing:

```bash
pnpm wrangler secret put CONFIG_ENCRYPTION_KEY
```

If `CONFIG_ENCRYPTION_KEY` is missing or invalid, non-secret settings can still be edited, but secret forms are disabled and the dashboard shows: `Secret editing requires CONFIG_ENCRYPTION_KEY`.

Do not generate or commit real secret values.

## Operating modes

The Admin Control Center supports:

| Mode | Meaning | Provider credential requirement |
| --- | --- | --- |
| `manual_only` | I will add content manually. Provider credentials are not required. | Not required. |
| `mock_demo` | Use mock providers and mock E2E checks for demos/testing. | Not required. |
| `provider_assisted` | Use configured providers such as Firecrawl, Apify, or GetXAPI. | At least one provider should be configured. |

Readiness and dashboard setup guidance respect the selected mode. Manual-only mode does not block setup on missing provider credentials, because apparently the product should not nag users about features they are not using.

## AI configuration

AI is a first-class setup area.

Editable AI settings include:

- `AI_PROVIDER`: `mock`, `openai`, `gemini`, `custom`
- `AI_MODEL`
- `AI_MODEL_FALLBACKS`
- `AI_OUTPUT_LANGUAGE`: `fa`, `en`, `ar`, `auto`
- `AI_TRANSLATION_ENABLED`
- `AI_REWRITE_ENABLED`
- `AI_SUMMARY_ENABLED`
- `AI_TONE_PRESET`: `neutral`, `editorial`, `concise`, `professional`, `social`, `custom`
- `AI_CUSTOM_SYSTEM_PROMPT`
- `AI_MAX_OUTPUT_TOKENS`
- `AI_TEMPERATURE`
- `AI_RETRY_ENABLED`
- `AI_MAX_RETRIES`

Dashboard model presets are suggestions only. Manual model IDs are allowed so new provider models do not require a code change.

OpenAI presets:

- `gpt-5.5`
- `gpt-5.4`
- `gpt-5.4-mini`
- `gpt-5.4-nano`

Gemini presets:

- `gemini-2.5-pro`
- `gemini-2.5-flash`
- `gemini-2.5-flash-lite`

Fallback chain behavior:

- `AI_MODEL_FALLBACKS` accepts a JSON array or comma-separated model IDs.
- Up to five fallback model IDs are allowed.
- Runtime fallback is stored and exposed now; actual fallback execution is provider/orchestration dependent and marked partially implemented in status.

AI credential settings are encrypted when saved from the dashboard:

- `AI_API_KEY`
- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- `CUSTOM_AI_API_KEY`

The dashboard shows configured/missing only and never displays saved values.

## Editable settings

Editable non-secret settings:

Operating mode and input:

- `OPERATING_MODE`
- `DEFAULT_CONTENT_SOURCE_MODE`

AI:

- `AI_PROVIDER`
- `AI_MODEL`
- `AI_MODEL_FALLBACKS`
- `AI_OUTPUT_LANGUAGE`
- `AI_TRANSLATION_ENABLED`
- `AI_REWRITE_ENABLED`
- `AI_SUMMARY_ENABLED`
- `AI_TONE_PRESET`
- `AI_CUSTOM_SYSTEM_PROMPT`
- `AI_MAX_OUTPUT_TOKENS`
- `AI_TEMPERATURE`
- `AI_RETRY_ENABLED`
- `AI_MAX_RETRIES`

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
- `ENABLE_APIFY_PROVIDER`
- `ENABLE_GETXAPI_PROVIDER`
- `FIRECRAWL_BASE_URL`
- `FIRECRAWL_TIMEOUT_MS`

Scheduler and limits:

- `SCHEDULER_DRY_RUN`
- `SCHEDULER_MAX_SOURCES_PER_RUN`
- `SCHEDULER_MAX_ITEMS_PER_RUN`
- `MAX_AI_ITEMS_PER_RUN`
- `MAX_PROVIDER_ITEMS_PER_RUN`
- `MAX_PUBLISH_ITEMS_PER_RUN`

Editable encrypted credentials:

- `AI_API_KEY`
- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- `CUSTOM_AI_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `WORDPRESS_APPLICATION_PASSWORD`
- `FIRECRAWL_API_KEY`
- `APIFY_TOKEN`
- `GETXAPI_KEY`

## Non-editable protected settings

The dashboard rejects attempts to edit:

- `INTERNAL_API_SECRET`
- `CONFIG_ENCRYPTION_KEY`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- D1 database IDs
- deployment credentials
- unknown keys
- anything that enables public publishing
- anything that enables final Telegram publishing
- anything that enables scheduler publishing

Cloudflare API tokens belong outside the app, for example in GitHub Actions Secrets or Cloudflare deployment tooling. They must never be placed in frontend code or D1 admin config.

## Admin routes

All admin config routes require `x-internal-api-secret` when `INTERNAL_API_SECRET` is configured.

| Route | Method | Purpose |
| --- | --- | --- |
| `/internal/admin/config` | `GET` | List grouped editable settings, metadata, safe values, secret status, validation metadata, modes, and model presets. |
| `/internal/admin/config` | `PUT` | Save one or more allowlisted config values. |
| `/internal/admin/config/reset` | `POST` | Remove D1 overrides for allowed keys. |
| `/internal/admin/config/audit` | `GET` | Return recent audit entries with redacted old/new values only. |

Secret values are never returned by these routes.

## D1 admin config storage

Migration:

- `packages/db/migrations/0030_admin_config.sql`

Tables:

- `admin_config`
- `admin_config_audit`

Secret values are encrypted with AES-GCM and a random IV per stored value. Audit rows store redacted values only.

Effective config priority:

1. D1 admin config override
2. Cloudflare Worker environment variable or Worker Secret
3. safe code default

## Dashboard product areas

The dashboard supports these areas:

- Access & Security
- Operating Mode
- Content Input
- AI Processing
- Providers
- Telegram Review
- WordPress Drafts
- Scheduler & Limits
- Pilot Testing
- Launch Readiness
- Audit / Recent Changes

Suggested setup path shown in the dashboard:

1. Connect Worker
2. Secure Admin Actions
3. Choose Operating Mode
4. Configure AI
5. Configure Review Channel
6. Configure Publishing Drafts
7. Optional Providers
8. Run Pilot Test
9. Launch Readiness

If operating mode is `manual_only`, provider setup is optional/skippable.

## Runtime integration

Effective D1-backed config is used by:

- `/status`
- `/ready`
- Telegram review dry-run
- WordPress draft dry-run
- Firecrawl sandbox fetch
- scheduler safety/manual dry-run summary
- controlled pilot checks

Dashboard controls do not enable scheduler publishing, final Telegram publishing, or public WordPress publishing.

## Dashboard access protection

Protect production dashboard deployment with Cloudflare Access or an equivalent access-control layer. The app does not implement a weak shared default password.

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
```

Dashboard:

```bash
pnpm dashboard:dev
pnpm dashboard:build
pnpm dashboard:preview
```

## Production readiness checklist

- [ ] `pnpm lint` passes.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm test` passes.
- [ ] `pnpm dashboard:build` passes.
- [ ] D1 migrations are applied.
- [ ] `INTERNAL_API_SECRET` is configured.
- [ ] `CONFIG_ENCRYPTION_KEY` is configured before dashboard secret editing.
- [ ] Dashboard is protected with Cloudflare Access or equivalent.
- [ ] Operating mode is selected intentionally.
- [ ] AI provider/model/credential state is reviewed.
- [ ] Scheduler publishing remains disabled.
- [ ] Final Telegram publishing remains disabled.
- [ ] Public WordPress publishing remains disabled.
- [ ] No sensitive runtime values appear in logs, responses, docs, tests, or frontend UI.

## Contributor rules

1. Do not add real secrets.
2. Do not enable real integrations by default.
3. Do not enable scheduler side effects.
4. Do not enable real publishing.
5. Do not make real network calls in tests.
6. Do not put Cloudflare API tokens or mutation flows in the dashboard.
7. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm dashboard:build` before opening or merging PRs.
