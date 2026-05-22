# Operations Runbook

This runbook covers operational setup, deployment, smoke testing, rollback, and recovery for the AI Curation Publisher Agent.

Mock/local mode is the default for tests and operational smoke checks. Do not introduce real provider calls or real credentials while following this runbook.

---

## 1. Safety rules

Never commit:

- real API keys
- Telegram bot tokens
- webhook secrets
- WordPress usernames or application passwords
- provider credentials
- private Cloudflare database IDs unless intentionally public project config
- `.dev.vars`
- exported production data
- D1 backups

Use these secret stores instead:

- GitHub Actions secrets for CI/deployment credentials
- Cloudflare Worker secrets for runtime credentials
- local `.dev.vars` for local testing

`.env.example` must stay sanitized with empty values only.

---

## 2. Required GitHub secrets

Set these in GitHub repository settings before using deployment or migration workflows:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

The token should have only the minimum permissions needed for Worker deploy and D1 migration operations.

Do not put the token value in workflow files, docs, issue comments, commits, or screenshots.

---

## 3. Required Cloudflare setup

Create or confirm these resources in Cloudflare:

- Worker project matching `wrangler.toml`
- D1 database named `curator_mvp`, or update the Wrangler/database command inputs to your chosen name
- Worker D1 binding named `DB`

`wrangler.toml` contains a placeholder D1 database ID for local/mock-safe development. Replace it through environment-specific Cloudflare/Wrangler configuration before production deployment if required by your deployment process.

Optional future bindings are documented but commented out:

- queue binding for publish orchestration
- R2 binding for prepared media

Keep them commented until real resources exist and the relevant phase wires them safely.

---

## 4. Local development

Install dependencies:

```bash
corepack enable
corepack prepare pnpm@9.15.4 --activate
pnpm install
```

Create local runtime values:

```bash
cp .env.example .dev.vars
```

Only put local values in `.dev.vars`. Do not commit it.

Apply local D1 migrations:

```bash
pnpm d1:migrate:local
```

Run the Worker locally:

```bash
pnpm worker:dev
```

Local operational routes:

```text
GET  /health
GET  /status
POST /internal/poll
POST /internal/e2e/mock-pipeline
POST /internal/publish/telegram
POST /telegram/webhook
```

---

## 5. CI

The CI workflow runs:

```bash
pnpm install --frozen-lockfile=false
pnpm lint
pnpm typecheck
pnpm test
```

Run the same commands locally before opening or merging a PR.

---

## 6. Deploy Worker

Manual deploy from GitHub Actions:

1. Open **Actions**.
2. Select **Deploy Cloudflare Worker**.
3. Run the workflow manually.
4. Confirm lint, typecheck, and tests pass before `wrangler deploy` runs.

Local deploy:

```bash
pnpm worker:deploy
```

Deployment uses:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

No runtime provider, Telegram, WordPress, or AI secrets are required for mock-mode smoke testing.

---

## 7. D1 migrations

Local migrations:

```bash
pnpm d1:migrate:local
```

Remote migrations:

```bash
pnpm d1:migrate:remote
```

GitHub Actions migration flow:

1. Open **Actions**.
2. Select **Apply D1 Migrations**.
3. Provide the database name if it differs from `curator_mvp`.
4. Run remote migrations only after backing up production data.

Migration rules:

- Prefer additive changes.
- Avoid destructive migrations in MVP phases.
- Back up before production migration.
- Verify application health after migration.

---

## 8. Smoke tests

Manual GitHub Actions smoke test:

1. Open **Actions**.
2. Select **Worker Smoke Test**.
3. Enter the deployed Worker base URL.
4. Keep mock poll enabled unless debugging only health/status.

Local smoke commands:

```bash
WORKER_BASE_URL=http://localhost:8787 pnpm worker:smoke
WORKER_BASE_URL=http://localhost:8787 pnpm worker:e2e:mock
```

Manual route checks:

```bash
curl -fsS "$WORKER_BASE_URL/health"
curl -fsS "$WORKER_BASE_URL/status"
curl -fsS -X POST "$WORKER_BASE_URL/internal/poll" \
  -H 'content-type: application/json' \
  -d '{"sources":[{"id":"source_instagram_demo","platform":"instagram","sourceType":"profile","value":"demo_profile","providerPriority":["mock_instagram"]}],"options":{"limit":1}}'
curl -fsS -X POST "$WORKER_BASE_URL/internal/e2e/mock-pipeline"
```

Expected `/internal/poll` behavior:

- uses mock providers by default
- does not call Apify, GetXAPI, HikerAPI, Firecrawl, or browser scraping
- returns per-source metadata and aggregate counts
- does not require provider credentials

---

## 9. End-to-end mock pipeline

Run the E2E mock pipeline locally:

```bash
WORKER_BASE_URL=http://localhost:8787 pnpm worker:e2e:mock
```

The route is:

```text
POST /internal/e2e/mock-pipeline
```

A successful response should include:

- `ok: true`
- `providerUsed: mock_instagram`
- `normalizedCount: 1`
- `queuedCount: 1`
- `duplicateCount: 0`
- `invalidCount: 0`
- `aiOutputCreated: true`
- `reviewMessageCreated: true`
- `approved: true`
- `queuedForPublish: true`
- `telegramPublished: true`
- `finalMessageId`
- `wordpressPrepared: true`
- `wordpressPublished: true`
- `wordpressPostId`

This smoke scenario proves the mock flow from source polling through mock final Telegram and mock WordPress publishing can be orchestrated end to end.

It does not test:

- real provider APIs
- real Telegram Bot API calls
- real WordPress REST API calls
- real media download or upload
- production auth
- Cloudflare Cron behavior

Use this before enabling real providers or deployment changes. If it fails, fix the mock pipeline before debugging external integrations. Yes, apparently checking the plumbing before flooding the house is useful.

---

## 10. Trigger mock publish

Trigger the Telegram publish route:

```bash
curl -fsS -X POST "$WORKER_BASE_URL/internal/publish/telegram" \
  -H 'content-type: application/json' \
  -d '{"publishNow":true}'
```

Expected outcomes:

- `none` when no publishable queued item exists
- `published` when a publishable queued Telegram item exists
- `failed` with a structured error if the existing publishing service fails

The internal publish route uses `MockTelegramClient`. Tests must not call the real Telegram Bot API.

---

## 11. Scheduled handler

`wrangler.toml` defines a mock-safe scheduled trigger:

```text
*/30 * * * *
```

The Worker scheduled handler calls the same mock poll operation used by `/internal/poll` and logs structured counts.

Current behavior:

- mock providers only
- no real external provider calls
- no real media download
- no real publishing from scheduled handler

Check logs after deploy:

```bash
pnpm exec wrangler tail --config wrangler.toml
```

In Cloudflare Dashboard, inspect Worker logs and trigger history for scheduled events.

---

## 12. Backup and export

The `Backup D1 Stub` workflow is intentionally a documented stub. Verify the current Cloudflare-supported D1 export command before enabling automated backups.

Candidate command to verify manually:

```bash
wrangler d1 export curator_mvp --remote --output backups/curator_mvp.sql
```

Before enabling real backups:

- confirm the current Wrangler D1 export syntax
- store artifacts privately
- configure retention
- avoid public logs with exported data
- test restore on a non-production database

---

## 13. Rollback

Rollback options:

1. Re-deploy the previous known-good Worker version from GitHub.
2. Revert the deployment PR and run **Deploy Cloudflare Worker**.
3. If a migration caused issues, restore from backup or apply a forward-fix migration.

Rollback checklist:

- Check `/health` and `/status`.
- Run mock `/internal/poll` smoke test.
- Run `/internal/e2e/mock-pipeline`.
- Check Worker logs with `wrangler tail`.
- Confirm D1 binding still resolves.
- Confirm no real provider credentials were required for recovery.

---

## 14. Failure recovery

### Worker deploy failure

1. Read the failed GitHub Actions step.
2. If lint/typecheck/test failed, fix code before retrying deploy.
3. If Wrangler auth failed, rotate or correct GitHub secrets.
4. If binding config failed, check `wrangler.toml` and Cloudflare resource names.

### D1 migration failure

1. Stop deploy/retry loops.
2. Inspect the failed migration and D1 state.
3. Restore from backup if production data is impacted.
4. Prefer forward-only corrective migrations.

### Smoke test failure

1. Check `/health`.
2. Check `/status`.
3. Check Worker logs.
4. Confirm the Worker URL input is correct.
5. Confirm `/internal/poll` and `/internal/e2e/mock-pipeline` are not blocked by routing rules.

### Provider failure

Provider smoke tests should use mocks by default. If a real provider is being called during tests, treat that as a bug and disable the real call path.

---

## 15. Operational routes reference

```text
GET  /health
GET  /status
POST /internal/poll
POST /internal/e2e/mock-pipeline
POST /internal/publish/telegram
POST /telegram/webhook
```

No route should expose secrets. `/status` may expose whether a config is present, but not the configured value.

---

## 16. Future phases

Do not add these in the E2E mock phase:

- real provider polling credentials
- real Apify/GetXAPI/HikerAPI/Firecrawl calls
- real Telegram Bot API calls
- real WordPress API calls
- real media download jobs
- real dashboard
- paid service integrations
- Phase 16 behavior

Add those only in their own scoped phases with tests and rollback notes.