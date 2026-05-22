# Production Deployment Dry-Run Checklist

Use this checklist for controlled Cloudflare deployment dry runs.

The baseline dry run is mock-first. Phase 18 adds a separate, explicit Firecrawl/Web sandbox check for one direct URL. Phase 19 adds a separate, explicit Telegram review-channel dry run. Phase 20 adds a separate, explicit WordPress draft dry run. Phase 21 adds scheduler safeguards and a manual scheduler dry-run route. All real-service checks are opt-in and should be disabled after verification.

## Scope

This checklist verifies:

- Cloudflare Worker deployability
- D1 migration flow
- Cloudflare and GitHub secret plumbing
- `/health`, `/status`, and `/ready`
- protected internal route usage
- mock source polling
- mock end-to-end pipeline
- manual scheduler dry-run
- optional Firecrawl/Web sandbox fetch
- optional Telegram review-channel dry run
- optional WordPress draft dry run
- rollback readiness

This checklist does not enable:

- real Apify, GetXAPI, or HikerAPI calls
- automatic real provider polling
- real final Telegram channel publishing
- public WordPress publishing
- real media download or processing
- production scheduler side effects
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
- [ ] Real providers remain disabled for the baseline dry run.
- [ ] Real Telegram review mode remains disabled for the baseline dry run.
- [ ] Real WordPress dry-run mode remains disabled for the baseline dry run.
- [ ] Scheduler remains disabled for the baseline dry run.
- [ ] Scheduler dry-run behavior remains enabled.

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
- [ ] No runtime secret values are committed to the repository.
- [ ] `.env.example` remains sanitized with empty values only.

For scheduler safeguards:

- [ ] Scheduler enabled flag remains disabled for baseline deploy.
- [ ] Scheduler dry-run flag remains enabled.
- [ ] Scheduler real-provider access remains disabled.
- [ ] Scheduler publishing access remains disabled.
- [ ] Source and item limits are conservative.
- [ ] AI, provider, and publish quotas are conservative.

For the optional Phase 18 Firecrawl sandbox only:

- [ ] `FIRECRAWL_API_KEY` is configured as a Cloudflare Worker secret.
- [ ] `PROVIDERS_MODE` is intentionally set to allow mixed provider mode for the sandbox check.
- [ ] `ENABLE_FIRECRAWL_PROVIDER` is intentionally enabled for the sandbox check.
- [ ] `FIRECRAWL_BASE_URL` is reviewed only if overriding the default endpoint.
- [ ] `FIRECRAWL_TIMEOUT_MS` is reviewed only if overriding the default timeout.
- [ ] Apify/Instagram and GetXAPI/X real provider flags remain disabled.

For the optional Phase 19 Telegram review-channel dry run only:

- [ ] `TELEGRAM_BOT_TOKEN` is configured as a Cloudflare Worker secret.
- [ ] `TELEGRAM_WEBHOOK_SECRET` is configured as a Cloudflare Worker secret if webhook testing is included.
- [ ] `TELEGRAM_REVIEW_CHAT_ID` is configured in the runtime environment.
- [ ] `TELEGRAM_REAL_REVIEW_ENABLED` is intentionally enabled for the dry run.
- [ ] `TELEGRAM_FINAL_CHAT_ID` is not used for real final publishing in this phase.
- [ ] Real final Telegram publishing remains disabled.

For the optional Phase 20 WordPress draft dry run only:

- [ ] `WORDPRESS_BASE_URL` is configured in the runtime environment.
- [ ] `WORDPRESS_USERNAME` is configured in the runtime environment.
- [ ] `WORDPRESS_APPLICATION_PASSWORD` is configured as a Cloudflare Worker secret.
- [ ] `WORDPRESS_DEFAULT_STATUS` is reviewed and should remain `draft` for this dry run.
- [ ] `WORDPRESS_REAL_DRY_RUN_ENABLED` is intentionally enabled for the dry run.
- [ ] Public WordPress publishing remains disabled.

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
- [ ] `/status` reports scheduler disabled by default.
- [ ] `/status` reports scheduler dry-run behavior by default.
- [ ] `/status` reports real provider and publishing access disabled by default.

## Protected internal route checks

When `INTERNAL_API_SECRET` is configured, internal routes require the configured internal route header.

```bash
curl -fsS -X POST "$WORKER_BASE_URL/internal/poll" \
  -H "content-type: application/json" \
  -H "x-internal-api-secret: $INTERNAL_API_SECRET" \
  -d '{"options":{"limit":1}}'
```

```bash
curl -fsS -X POST "$WORKER_BASE_URL/internal/scheduler/run" \
  -H "content-type: application/json" \
  -H "x-internal-api-secret: $INTERNAL_API_SECRET" \
  -d '{"dryRun":true,"maxSources":1,"maxItems":1}'
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
- [ ] Manual scheduler dry-run passes.
- [ ] Manual scheduler response reports mock-safe behavior.
- [ ] Manual scheduler response reports no publishing side effects.
- [ ] Mock E2E smoke pipeline passes.
- [ ] Internal publish route returns a structured result.
- [ ] Missing or invalid internal secret returns `401`.
- [ ] Internal route responses do not expose secret values.

## Optional Firecrawl sandbox fetch

Use this only after the baseline mock dry run passes and Firecrawl has been intentionally enabled for sandbox testing.

```bash
curl -fsS -X POST "$WORKER_BASE_URL/internal/providers/firecrawl/sandbox-fetch" \
  -H "content-type: application/json" \
  -H "x-internal-api-secret: $INTERNAL_API_SECRET" \
  -d '{"url":"https://example.com/article"}'
```

Expected behavior:

- [ ] The route is inspect-only.
- [ ] The response includes provider status and normalized post data.
- [ ] No item is enqueued.
- [ ] No AI processing is triggered.
- [ ] No Telegram publishing is triggered.
- [ ] No WordPress publishing is triggered.
- [ ] No media download is triggered.
- [ ] The response does not expose secret values.

Disable Firecrawl immediately after the sandbox check by removing or disabling the Firecrawl enable flag and returning provider mode to the mock-safe configuration.

## Optional Telegram review-channel dry run

Use this only after the baseline mock dry run passes and real Telegram review mode has been intentionally enabled.

```bash
curl -fsS -X POST "$WORKER_BASE_URL/internal/telegram/review-dry-run" \
  -H "content-type: application/json" \
  -H "x-internal-api-secret: $INTERNAL_API_SECRET" \
  -d '{"text":"Review dry-run content","sourceUrl":"https://example.com/post"}'
```

Expected behavior:

- [ ] The response reports `mode` as `real` when real review mode is enabled and configured.
- [ ] A review draft appears in the configured review chat or channel.
- [ ] The response includes a Telegram message id.
- [ ] No final Telegram publishing is triggered.
- [ ] No publish queue item is created.
- [ ] No WordPress publishing is triggered.
- [ ] No provider polling is triggered.
- [ ] No media download is triggered.
- [ ] The response does not expose token, chat id, webhook secret, or internal secret values.

Disable real Telegram review mode immediately after the dry run.

## Optional WordPress draft dry run

Use this only after the baseline mock dry run passes and real WordPress dry-run mode has been intentionally enabled.

```bash
curl -fsS -X POST "$WORKER_BASE_URL/internal/wordpress/dry-run" \
  -H "content-type: application/json" \
  -H "x-internal-api-secret: $INTERNAL_API_SECRET" \
  -d '{"title":"Dry-run post title","content":"Dry-run post content","sourceUrl":"https://example.com/source"}'
```

Expected behavior:

- [ ] The response reports `mode` as `real` when real dry-run mode is enabled and configured.
- [ ] The response reports `draftRequested` as `true`.
- [ ] The response reports `statusRequested` as `draft`.
- [ ] A draft appears in WordPress admin.
- [ ] No public WordPress post is created.
- [ ] No Telegram publishing is triggered.
- [ ] No provider polling is triggered.
- [ ] No media upload or download is triggered.
- [ ] The response does not expose username, application password, internal secret, or raw credential values.

Disable real WordPress dry-run mode immediately after the dry run and delete test drafts if they should not remain in WordPress.

## Readiness interpretation

- [ ] Local/mock readiness can return ready with warnings for optional production config.
- [ ] Production readiness returns `503` when `INTERNAL_API_SECRET` is missing.
- [ ] Production readiness returns `503` when required Telegram review/final chat config is missing.
- [ ] Missing provider credentials are acceptable when real providers are disabled.
- [ ] Scheduler disabled is the safe default.
- [ ] Scheduler enabled without dry-run should produce warnings.
- [ ] Scheduler real-provider access should remain disabled unless a later scoped phase enables it.
- [ ] Scheduler publishing access should remain disabled unless a later scoped phase enables it.
- [ ] Firecrawl enabled without credentials is treated as missing credentials and must not crash.
- [ ] Telegram real review enabled without bot token or review chat is treated as incomplete config and must not crash.
- [ ] WordPress real dry-run enabled without base URL, username, or application password is treated as incomplete config and must not crash.
- [ ] Real provider flags without credentials are treated as warnings or errors safely.
- [ ] No token, password, API key, authorization, chat id, webhook secret, username, base URL, or internal secret values appear in readiness output.

## Provider safety

- [ ] `PROVIDERS_MODE` does not force real provider usage for the baseline dry run.
- [ ] Firecrawl is enabled only for the explicit sandbox fetch.
- [ ] Apify/Instagram remains disabled.
- [ ] GetXAPI/X remains disabled.
- [ ] No browser scraping call is expected.
- [ ] Scheduled behavior remains mock-safe.

## Scheduler safety

- [ ] Scheduler enabled flag remains disabled for baseline operation.
- [ ] Scheduler dry-run flag remains enabled.
- [ ] Real provider scheduler access remains disabled.
- [ ] Publishing scheduler access remains disabled.
- [ ] Source and item limits are conservative.
- [ ] AI and publish quotas remain at zero unless a later scoped phase changes them.
- [ ] Cloudflare cron execution returns skipped results until the scheduler is intentionally enabled.

## Telegram safety

- [ ] Real review mode is enabled only for the explicit review-channel dry run.
- [ ] Final Telegram publishing remains mock-safe.
- [ ] WordPress publishing remains mock-safe unless intentionally running the WordPress draft dry run.
- [ ] No provider changes are part of the Telegram dry run.
- [ ] Callback testing does not bypass approval or final publishing controls.

## WordPress safety

- [ ] Real WordPress dry-run mode is enabled only for the explicit draft dry run.
- [ ] Draft creation is the only real WordPress action allowed in this phase.
- [ ] Public publishing remains disabled.
- [ ] Media upload remains disabled.
- [ ] No provider, Telegram, or scheduler changes are part of the WordPress dry run.

## Rollback readiness

- [ ] Previous known-good Worker version is identifiable in Cloudflare.
- [ ] Operator knows how to redeploy a previous commit or revert the PR.
- [ ] Operator knows how to disable scheduled triggers if a future phase enables them.
- [ ] Operator knows how to return provider mode to mock.
- [ ] Operator knows how to disable scheduler immediately.
- [ ] Operator knows how to disable Firecrawl immediately.
- [ ] Operator knows how to disable real Telegram review mode immediately.
- [ ] Operator knows how to disable real WordPress dry-run mode immediately.
- [ ] D1 rollback is treated as conservative and manual; no automated destructive rollback is assumed.

## Dry-run completion

- [ ] Deploy completed.
- [ ] Migrations completed.
- [ ] `/health` passed.
- [ ] `/status` passed.
- [ ] `/ready` passed.
- [ ] Protected mock internal poll passed.
- [ ] Protected manual scheduler dry-run passed.
- [ ] Protected mock E2E pipeline passed.
- [ ] Optional Firecrawl sandbox fetch passed, if intentionally run.
- [ ] Optional Telegram review-channel dry run passed, if intentionally run.
- [ ] Optional WordPress draft dry run passed, if intentionally run.
- [ ] Logs reviewed.
- [ ] No secrets exposed.
- [ ] Unwanted real providers remain disabled.
- [ ] Scheduler remains disabled or dry-run/mock-safe.
- [ ] Real Telegram review mode is disabled after the check.
- [ ] Real WordPress dry-run mode is disabled after the check.
- [ ] Rollback path confirmed.

Record dry-run notes in the PR or release checklist, including the Worker URL, commit SHA, migration outcome, smoke-test outcome, scheduler dry-run outcome, Firecrawl sandbox outcome if run, Telegram review dry-run outcome if run, WordPress dry-run outcome if run, and any follow-up actions. Do not record secret values.
