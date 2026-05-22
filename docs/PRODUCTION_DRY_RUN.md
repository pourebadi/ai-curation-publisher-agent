# Production Deployment Dry-Run Checklist

Use this checklist for the first controlled Cloudflare deployment dry run.

This dry run is mock-first. It is intended to prove that the Worker can be deployed, configured, migrated, checked, smoked, observed, and rolled back without enabling real providers or real production publishing.

## Scope

This checklist verifies:

- Cloudflare Worker deployability
- D1 migration flow
- Cloudflare and GitHub secret plumbing
- `/health`, `/status`, and `/ready`
- protected internal route usage
- mock source polling
- mock end-to-end pipeline
- rollback readiness

This checklist does not enable:

- real Apify, GetXAPI, HikerAPI, or Firecrawl calls
- real Telegram Bot API publishing
- real WordPress REST API publishing
- real media download or processing
- production scheduler rollout
- dashboard or monitoring integration

## Pre-flight checks

- [ ] GitHub `main` is green.
- [ ] Current branch has passed `pnpm lint`.
- [ ] Current branch has passed `pnpm typecheck`.
- [ ] Current branch has passed `pnpm test`.
- [ ] The deploy target Cloudflare account is selected.
- [ ] Wrangler authentication is available to the operator or GitHub Actions.
- [ ] `wrangler.toml` has been reviewed.
- [ ] `wrangler.toml` does not contain real secrets.
- [ ] Real providers remain disabled.
- [ ] Scheduler behavior is understood and remains mock-safe.

## Cloudflare resources

- [ ] Remote D1 database exists.
- [ ] Worker D1 binding is named `DB`.
- [ ] D1 migrations directory is `packages/db/migrations`.
- [ ] Optional Queue bindings remain disabled unless a future scoped phase enables them.
- [ ] Optional R2 bindings remain disabled unless a future scoped phase enables them.

## Secrets and environment

- [ ] `INTERNAL_API_SECRET` is set as a Cloudflare Worker secret for deployed internal routes.
- [ ] GitHub Actions secret `CLOUDFLARE_API_TOKEN` is set.
- [ ] GitHub Actions secret `CLOUDFLARE_ACCOUNT_ID` is set.
- [ ] No real provider credentials are required for this dry run.
- [ ] Provider mode remains mock or otherwise does not select real providers.
- [ ] No runtime secret values are committed to the repository.
- [ ] `.env.example` remains sanitized with empty values only.

## Migrations

- [ ] Remote migration target has been confirmed.
- [ ] D1 migrations have been applied to the remote database.
- [ ] Migration output has been reviewed.
- [ ] No destructive migration was introduced for this dry run.
- [ ] Backup/export strategy is understood before production data is introduced.

## Deploy

- [ ] Manual GitHub Actions deploy workflow has been reviewed.
- [ ] Manual deployment has been triggered intentionally.
- [ ] Deploy workflow completed successfully.
- [ ] Worker URL is known and stored in the local shell as `WORKER_BASE_URL`.
- [ ] Deployment logs do not expose secrets.

## Smoke checks

Run these against the deployed Worker.

```bash
curl -fsS "$WORKER_BASE_URL/health"
curl -fsS "$WORKER_BASE_URL/status"
curl -fsS "$WORKER_BASE_URL/ready"
```

- [ ] `/health` passes.
- [ ] `/status` passes.
- [ ] `/ready` passes.
- [ ] `/status` and `/ready` do not expose secret values.

## Protected internal route checks

When `INTERNAL_API_SECRET` is configured, internal routes require the `x-internal-api-secret` header.

```bash
curl -fsS -X POST "$WORKER_BASE_URL/internal/poll" \
  -H "content-type: application/json" \
  -H "x-internal-api-secret: $INTERNAL_API_SECRET" \
  -d '{"options":{"limit":1}}'
```

```bash
curl -fsS -X POST "$WORKER_BASE_URL/internal/e2e/mock-pipeline" \
  -H "x-internal-api-secret: $INTERNAL_API_SECRET"
```

```bash
curl -fsS -X POST "$WORKER_BASE_URL/internal/publish/telegram" \
  -H "content-type: application/json" \
  -H "x-internal-api-secret: $INTERNAL_API_SECRET" \
  -d '{"publishNow":true}'
```

- [ ] Mock internal poll passes.
- [ ] Mock E2E smoke pipeline passes.
- [ ] Internal publish route returns a structured result.
- [ ] Missing or invalid internal secret returns `401`.
- [ ] Internal route responses do not expose secret values.

## Readiness interpretation

- [ ] Local/mock readiness can return ready with warnings for optional production config.
- [ ] Production readiness returns `503` when `INTERNAL_API_SECRET` is missing.
- [ ] Production readiness returns `503` when required Telegram review/final chat config is missing.
- [ ] Missing provider credentials are acceptable when real providers are disabled.
- [ ] Real provider flags without credentials are treated as warnings or errors safely.
- [ ] No token, password, API key, authorization, or internal secret values appear in readiness output.

## Provider safety

- [ ] `PROVIDERS_MODE` does not force real provider usage for this dry run.
- [ ] Real provider enable flags remain unset or disabled.
- [ ] No Apify, GetXAPI, HikerAPI, Firecrawl, or browser scraping call is expected.
- [ ] Smoke tests use mock providers only.
- [ ] Scheduled behavior remains mock-safe.

## Rollback readiness

- [ ] Previous known-good Worker version is identifiable in Cloudflare.
- [ ] Operator knows how to redeploy a previous commit or revert the PR.
- [ ] Operator knows how to disable scheduled triggers if a future phase enables them.
- [ ] Operator knows how to return provider mode to mock.
- [ ] Operator knows how to disable real provider feature flags if they are accidentally configured.
- [ ] D1 rollback is treated as conservative and manual; no automated destructive rollback is assumed.

## Dry-run completion

- [ ] Deploy completed.
- [ ] Migrations completed.
- [ ] `/health` passed.
- [ ] `/status` passed.
- [ ] `/ready` passed.
- [ ] Protected mock internal poll passed.
- [ ] Protected mock E2E pipeline passed.
- [ ] Logs reviewed.
- [ ] No secrets exposed.
- [ ] Real providers remain disabled.
- [ ] Rollback path confirmed.

Record dry-run notes in the PR or release checklist, including the Worker URL, commit SHA, migration outcome, smoke-test outcome, and any follow-up actions. Do not record secret values.
