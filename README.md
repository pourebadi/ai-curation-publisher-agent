# AI Curation Publisher Agent

Incremental, provider-agnostic social content curator for Telegram and WordPress.

The MVP ingests public social posts, normalizes them, deduplicates them before any expensive processing, validates them, generates platform-specific AI outputs, sends items to a private Telegram review channel, and publishes approved content to Telegram and then WordPress.

This repository is designed to be built phase by phase. Do not ask a coding agent to build the entire product in one pass.

## Current phase

This branch implements **Phase 1: Repository Bootstrap**.

Included in Phase 1:

- pnpm monorepo scaffold
- TypeScript project references
- Cloudflare Worker scaffold
- D1 migration for the MVP tables
- shared core types for sources, items, media, providers, outputs, lifecycle statuses, queues, and settings
- repository and service layer stubs
- mock social provider adapter
- Telegram webhook route stub
- GitHub Actions CI for lint, typecheck, and tests
- `.env.example` with placeholder values only

Not included in Phase 1:

- real Instagram provider calls
- real X/Twitter provider calls
- real AI provider calls
- real WordPress publishing
- yt-dlp or ffmpeg media processing
- production Telegram publishing
- dashboard
- Cloudflare deployment automation beyond CI

## Repository structure

```text
apps/
  worker-api/
    src/
      index.ts
      routes/
      handlers/
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

Enable pnpm through Corepack if it is not installed globally:

```bash
corepack enable
corepack prepare pnpm@9.15.4 --activate
```

## Install

```bash
pnpm install
```

## Lint

```bash
pnpm lint
```

The Phase 1 lint script performs lightweight repository hygiene checks without adding ESLint yet. A full linting setup can be added later when coding conventions stabilize.

## Typecheck

```bash
pnpm typecheck
```

## Test

```bash
pnpm test
```

Phase 1 tests cover lifecycle transition rules and the mock provider adapter.

## Run the Worker locally

Copy the example environment file:

```bash
cp .env.example .dev.vars
```

Apply local D1 migrations:

```bash
pnpm db:migrate:local
```

Start the Worker:

```bash
pnpm worker:dev
```

Available local routes:

```text
GET  /health
POST /telegram/webhook
```

The Telegram webhook route is a stub. It validates the request shape and returns a structured acknowledgement, but it does not call the Telegram Bot API or publish anything.

## D1 migrations

The initial D1 schema lives in:

```text
packages/db/migrations/0001_initial_schema.sql
```

It creates the MVP state tables described in `docs/BLUEPRINT.md`: sources, items, dedupe keys, media assets, prompts, outputs, review messages, publish queue, WordPress posts, provider logs, review actions, and settings.

## Agent workflow

Start every coding session with:

```text
prompts/START_HERE_PROMPT.md
```

Then move one phase at a time:

```text
prompts/PHASE_01_PROMPT.md
prompts/PHASE_02_PROMPT.md
...
```

Never prompt an agent to build the full project at once.

## Phase 2 next

Phase 2 should implement Telegram manual ingest and review flow:

- real Telegram webhook parsing
- manual link/text ingestion
- reviewer authorization
- review message builder
- inline keyboard for edit/send/cancel/status
- `review_actions` logging
- item lookup from Telegram reply/callback context
