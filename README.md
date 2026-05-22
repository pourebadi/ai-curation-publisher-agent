# AI Curation Publisher Agent

Incremental, provider-agnostic social content curator for Telegram and WordPress.

The system ingests public social/web content, normalizes it, deduplicates and validates it before expensive processing, generates platform-specific outputs, sends items through Telegram review, publishes approved content to Telegram, and supports WordPress publishing through an abstracted client.

The project is intentionally implemented phase by phase. Keep future work scoped and avoid collapsing multiple phases into one change.

## Operational status

This branch implements **Phase 12: Cloudflare deployment wiring, scheduled jobs, GitHub Actions workflows, smoke tests, and operational runbook documentation**.

Phase 12 keeps mock/local mode as the default for tests and smoke checks. It does not add real provider API calls, real provider secrets, real media downloads, or real Telegram/WordPress credentials.

## Repository structure

```text
apps/
  worker-api/
    src/
      index.ts
      routes/
      handlers/
      operations/
      queues/
      scheduled/
packages/
  core/
  db/
  providers/
  ai/
  telegram/
  wordpress/
  media/
  scheduler/
  observability/
.github/workflows/
```

## Requirements

- Node.js 22+
- pnpm 9+
- Cloudflare Wrangler, installed through dev dependencies

Enable pnpm through Corepack if needed:

```bash
corepack enable
corepack prepare pnpm@9.15.4 --activate
```

## Install and verify

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
```

CI runs the same lint, typecheck, and test commands.

## Run the Worker locally

Copy local env values into `.dev.vars` if needed. Do not commit `.dev.vars`.

```bash
cp .env.example .dev.vars
pnpm d1:migrate:local
pnpm worker:dev
```

Local operational routes:

```text
GET  /health
GET  /status
POST /internal/poll
POST /internal/publish/telegram
POST /telegram/webhook
```

Trigger a mock poll locally:

```bash
curl -fsS -X POST http://localhost:8787/internal/poll \
  -H 'content-type: application/json' \
  -d '{"sources":[{"id":"source_instagram_demo","platform":"instagram","sourceType":"profile","value":"demo_profile","providerPriority":["mock_instagram"]}],"options":{"limit":1}}'
```

## Deploy

Deployment is configured through `wrangler.toml` and GitHub Actions.

Required GitHub repository secrets for deployment workflows:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

Run deploy manually from GitHub Actions using **Deploy Cloudflare Worker**, or deploy locally with:

```bash
pnpm worker:deploy
```

Apply D1 migrations locally or remotely:

```bash
pnpm d1:migrate:local
pnpm d1:migrate:remote
```

## Smoke tests

Use the manual GitHub Actions workflow **Worker Smoke Test**, or run:

```bash
WORKER_BASE_URL=https://your-worker.example pnpm worker:smoke
```

The smoke workflow checks `/health`, `/status`, and can optionally call `/internal/poll` with mock providers.

## Secrets policy

Never commit real secrets, API keys, tokens, passwords, database IDs for private infrastructure, webhook secrets, or provider credentials. Use Cloudflare secrets and GitHub Actions secrets. `.env.example` must remain sanitized with empty values only.

Detailed deployment, rollback, migration, and recovery steps are in `docs/RUNBOOK.md`.