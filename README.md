# AI Curation Publisher Agent

Incremental, provider-agnostic social content curator for Telegram and WordPress.

The MVP ingests public social posts, normalizes them, deduplicates them before any expensive processing, validates them, generates platform-specific AI outputs, sends items to a private Telegram review channel, and publishes approved content to Telegram and then WordPress.

This repository is designed to be built phase by phase. Do not ask a coding agent to build the entire product in one pass.

## Current phase

This branch implements **Phase 2: Telegram Manual Ingest + Review**.

Included in Phase 2:

- real Telegram webhook parsing for message and callback updates
- manual text input ingestion
- manual URL input ingestion
- manual item creation in D1 using mocked processing
- basic duplicate detection by Telegram source message ID
- manual review message draft formatting
- inline review buttons for Edit, Send, Cancel, and Status
- callback routing stubs for edit, send, cancel, and status
- review message metadata storage
- review action logging
- tests for parsing, manual item creation, and callback routing

Still not included in Phase 2:

- real Instagram provider calls
- real X/Twitter provider calls
- real AI provider calls
- real WordPress publishing
- real final Telegram publishing
- media download or processing
- production scheduling logic beyond stubs

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

The current lint script performs lightweight repository hygiene checks. A full linting setup can be added later when coding conventions stabilize.

## Typecheck

```bash
pnpm typecheck
```

## Test

```bash
pnpm test
```

Phase 2 tests cover Telegram webhook parsing, manual item creation, and review callback routing.

## Run the Worker locally

Copy the example environment file:

```bash
cp .env.example .dev.vars
```

Set local-only values in `.dev.vars`. Do not commit that file. At minimum, configure the review chat and allowed reviewer IDs with your own local Telegram IDs.

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

## Test Telegram webhook with local mocks

After starting the Worker, send a manual text update:

```bash
curl -X POST http://localhost:8787/telegram/webhook \
  -H 'content-type: application/json' \
  -d '{"update_id":1,"message":{"message_id":2,"from":{"id":3,"first_name":"Local"},"chat":{"id":4,"type":"private"},"text":"Manual post for review https://source.local/post"}}'
```

Expected behavior:

- the update is parsed as `manual_message`
- the sender is checked against `TELEGRAM_ALLOWED_REVIEWER_IDS`
- a manual source row is ensured
- an item row is created or reused
- review message metadata is stored
- the JSON response includes a `reviewDraft` with Edit, Send, Cancel, and Status buttons

Send a callback mock:

```bash
curl -X POST http://localhost:8787/telegram/webhook \
  -H 'content-type: application/json' \
  -d '{"update_id":5,"callback_query":{"id":"callback-local","from":{"id":3,"first_name":"Local"},"message":{"message_id":6,"chat":{"id":4,"type":"private"}},"data":"review:status:item_local"}}'
```

Expected behavior:

- the update is parsed as `callback`
- the callback action is logged in `review_actions`
- `status` and `edit` remain stubs
- `send` marks the item as approved but does not publish
- `cancel` marks the item as cancelled

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

## Phase 3 next

Phase 3 should implement stronger dedupe, validation, and lifecycle rules before AI or media processing:

- canonical URL hashing strategy
- normalized text hashing strategy
- exact duplicate detection across sources
- validation service for manual and provider items
- lifecycle transition guards in the ingest flow
- tests for duplicate and invalid states
