# Operations Runbook

This runbook covers operational setup, deployment, smoke testing, readiness checks, rollback, and recovery for the AI Curation Publisher Agent.

Mock/local mode is the default for tests and operational smoke checks. Do not introduce real provider calls or real credentials while following this runbook.

---

## 1. Safety rules

Never commit:

- real API keys
- Telegram bot tokens
- webhook secrets
- WordPress usernames or application passwords
- provider credentials
- internal API secrets
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
GET  /ready
GET  /status
POST /internal/poll
POST /internal/e2e/mock-pipeline
POST /internal/publish/telegram
POST /telegram/webhook
```

---

## 5. Internal route protection

Internal routes are protected when `INTERNAL_API_SECRET` is configured:

```text
POST /internal/poll
POST /internal/e2e/mock-pipeline
POST /internal/publish/telegram
```

Local/mock behavior:

- if `INTERNAL_API_SECRET` is unset, internal routes remain accessible for local development and tests
- no real provider calls are made by default

Production behavior:

- configure `INTERNAL_API_SECRET` as a Cloudflare Worker secret
- send the header with every internal route request

```bash
pnpm exec wrangler secret put INTERNAL_API_SECRET --config wrangler.toml
```

Example internal request:

```bash
curl -fsS -X POST "$WORKER_BASE_URL/internal/poll" \
  -H "content-type: application/json" \
  -H "x-internal-api-secret: $INTERNAL_API_SECRET" \
  -d '{"options":{"limit":1}}'
```

Do not log, print, commit, or paste the secret value.

---

## 6. Readiness checks

Readiness route:

```text
GET /ready
```

Local/mock mode should return `200` with `ready: true` and warnings when optional production config is missing.

Production mode returns `503` when required production config is missing. Expected production checks include:

- `INTERNAL_API_SECRET` configured
- Telegram review/final chat IDs configured
- provider mode and provider credentials are consistent
- WordPress config is summarized without exposing values

Run locally or against a deployed Worker:

```bash
curl -fsS "$WORKER_BASE_URL/ready"
```

Readiness responses must not expose token, secret, password, API key, or authorization values.

---

## 7. Safe logging policy

Use the Worker logger utility for structured logs. It redacts known secret-like keys, including:

- `token`
- `secret`
- `password`
- `apiKey`
- `applicationPassword`
- `authorization`

Logging rules:

- log booleans like `hasTelegramConfig`, not raw values
- never log request headers wholesale
- never log `.dev.vars`
- never log provider credentials
- never log Telegram bot tokens or WordPress application passwords

---

## 8. Rate-limit guard foundation

Phase 16 adds a lightweight rate-limit guard interface:

- `RateLimitGuard`
- `NoopRateLimitGuard`
- `InMemoryRateLimitGuard` for tests/future wiring

The default internal route behavior uses the no-op guard. Do not assume this is production-grade abuse protection. Durable Objects, KV, or another shared store should be introduced in a future scoped phase if production distributed rate limiting is needed.

---

## 9. CI

The CI workflow runs:

```bash
pnpm install --frozen-lockfile=false
pnpm lint
pnpm typecheck
pnpm test
```

Run the same commands locally before opening or merging a PR.

---

## 10. Deploy Worker

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

## 11. D1 migrations

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

## 12. Smoke tests

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
curl -fsS "$WORKER_BASE_URL/ready"
curl -fsS "$WORKER_BASE_URL/status"
curl -fsS -X POST "$WORKER_BASE_URL/internal/poll" \
  -H 'content-type: application/json' \
  -d '{"sources":[{"id":"source_instagram_demo","platform":"instagram","sourceType":"profile","value":"demo_profile","providerPriority":["mock_instagram"]}],"options":{"limit":1}}'
curl -fsS -X POST "$WORKER_BASE_URL/internal/e2e/mock-pipeline"
```

When `INTERNAL_API_SECRET` is configured, include `x-internal-api-secret` on internal route checks.

Expected `/internal/poll` behavior:

- uses mock providers by default
- does not call Apify, GetXAPI, HikerAPI, Firecrawl, or browser scraping
- returns per-source metadata and aggregate counts
- does not require provider credentials in mock mode

---

## 13. End-to-end mock pipeline

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
- production auth beyond the optional internal header guard
- Cloudflare Cron behavior

Use this before enabling real providers or deployment changes.

---

## 14. Trigger mock publish

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

## 15. Scheduled handler

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

## 16. Production readiness checklist

Before production rollout:

- `pnpm lint` passes
- `pnpm typecheck` passes
- `pnpm test` passes
- `/health` returns `200`
- `/ready` returns `200`
- `INTERNAL_API_SECRET` is configured as a Cloudflare secret
- internal route calls include `x-internal-api-secret`
- D1 migrations have been applied
- Cloudflare Worker logs do not contain secrets
- real providers remain disabled unless a scoped rollout phase enables them
- mock E2E pipeline succeeds
- rollback path is known

---

## 17. Backup and export

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

## 18. Rollback

Rollback options:

1. Re-deploy the previous known-good Worker version from GitHub.
2. Revert the deployment PR and run **Deploy Cloudflare Worker**.
3. If a migration caused issues, restore from backup or apply a forward-fix migration.

Rollback checklist:

- Check `/health`, `/ready`, and `/status`.
- Run mock `/internal/poll` smoke test.
- Run `/internal/e2e/mock-pipeline`.
- Check Worker logs with `wrangler tail`.
- Confirm D1 binding still resolves.
- Confirm no real provider credentials were required for recovery.

---

## 19. Failure recovery

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
2. Check `/ready`.
3. Check `/status`.
4. Check Worker logs.
5. Confirm the Worker URL input is correct.
6. Confirm `/internal/poll` and `/internal/e2e/mock-pipeline` are not blocked by routing rules.
7. If `INTERNAL_API_SECRET` is configured, confirm the request includes `x-internal-api-secret`.

### Provider failure

Provider smoke tests should use mocks by default. If a real provider is being called during tests, treat that as a bug and disable the real call path.

---

## 20. Operational routes reference

```text
GET  /health
GET  /ready
GET  /status
POST /internal/poll
POST /internal/e2e/mock-pipeline
POST /internal/publish/telegram
POST /telegram/webhook
```

No route should expose secrets. `/status` and `/ready` may expose whether a config is present, but not the configured value.

---

## 21. Future phases

Do not add these in the production hardening phase:

- real provider rollout
- real Apify/GetXAPI/HikerAPI/Firecrawl calls
- real Telegram Bot API calls
- real WordPress API calls
- real media download jobs
- dashboard
- paid service integrations
- Durable Objects or KV rate limiting
- Phase 17 behavior

Add those only in their own scoped phases with tests and rollback notes.
