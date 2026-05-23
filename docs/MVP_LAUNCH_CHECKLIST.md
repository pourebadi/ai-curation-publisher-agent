# MVP Launch Checklist

Use this checklist before declaring the MVP operationally ready.

This checklist does not enable production automation. It verifies that the mock-first MVP is deployable, observable through operational routes, protected by internal route guards, and ready for controlled dry-run checks.

## 1. Local verification

- [ ] Dependencies installed with `pnpm install`.
- [ ] `pnpm lint` passes.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm test` passes.
- [ ] Local D1 migrations have been applied if needed.
- [ ] Worker starts locally with `pnpm worker:dev`.
- [ ] `GET /health` passes locally.
- [ ] `GET /status` passes locally.
- [ ] `GET /ready` passes locally.
- [ ] `POST /internal/e2e/mock-pipeline` passes locally.
- [ ] `POST /internal/scheduler/run` passes as a dry-run locally.
- [ ] `POST /internal/pilot/real-integrations` with `{}` returns readiness/config summary only.

Useful commands:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm worker:dev
WORKER_BASE_URL=http://localhost:8787 pnpm worker:health
WORKER_BASE_URL=http://localhost:8787 pnpm worker:smoke
WORKER_BASE_URL=http://localhost:8787 pnpm worker:e2e:mock
```

Manual readiness-only pilot check:

```bash
curl -fsS -X POST "$WORKER_BASE_URL/internal/pilot/real-integrations" \
  -H "content-type: application/json" \
  -d '{}'
```

## 2. Cloudflare verification

- [ ] Correct Cloudflare account is selected.
- [ ] Wrangler authentication works for the operator or deploy workflow.
- [ ] Remote D1 database exists.
- [ ] D1 binding is configured as `DB`.
- [ ] Remote D1 migrations have been applied.
- [ ] Worker deploy workflow remains manual unless intentionally changed in a future phase.
- [ ] Worker has been deployed manually.
- [ ] Deployed `GET /health` passes.
- [ ] Deployed `GET /status` passes.
- [ ] Deployed `GET /ready` passes.
- [ ] Internal route protection is configured for deployed internal routes.
- [ ] Protected mock internal poll passes.
- [ ] Protected mock E2E pipeline passes.
- [ ] Protected controlled pilot readiness-only check passes.
- [ ] Worker logs do not contain sensitive runtime values.

## 3. Secrets verification

- [ ] Cloudflare runtime secrets are configured outside the repository.
- [ ] GitHub Actions deployment secrets are configured outside the repository.
- [ ] `.env.example` contains empty values only.
- [ ] `.dev.vars` is not committed.
- [ ] No real runtime values are committed in docs, code, tests, workflow files, or comments.
- [ ] No credential-looking placeholder values are committed.
- [ ] Internal route secret is configured for deployed environments.
- [ ] Provider, Telegram, WordPress, and AI runtime values are configured only when needed for their explicit dry-runs.

## 4. Safety verification

- [ ] Scheduler is disabled by default.
- [ ] Scheduler dry-run behavior remains the safe default.
- [ ] Real provider access is disabled by default.
- [ ] Publishing access is disabled by default.
- [ ] Final Telegram publishing is not enabled by default.
- [ ] Public WordPress publishing is not enabled by default.
- [ ] Firecrawl/Web is opt-in only.
- [ ] Telegram review-channel dry-run is opt-in only.
- [ ] WordPress real dry-run creates drafts only.
- [ ] Controlled pilot steps are explicit opt-in only.
- [ ] Controlled pilot `{}` request performs readiness/config summary only.
- [ ] No real media download/upload path is enabled.
- [ ] Tests do not make real external calls.

## 5. Controlled pilot verification

Read `docs/CONTROLLED_REAL_INTEGRATIONS_PILOT.md` before running any real integration check.

Readiness-only check:

- [ ] `POST /internal/pilot/real-integrations` with `{}` returns a structured result.
- [ ] Firecrawl step is skipped.
- [ ] Telegram review step is skipped.
- [ ] WordPress draft step is skipped.
- [ ] No external integration call is made.

Optional individual checks, only when intentionally configured:

- [ ] Firecrawl sandbox step returns normalized data or a typed provider failure.
- [ ] Telegram review step sends only a review dry-run message.
- [ ] WordPress draft step creates only a draft.
- [ ] One failed step does not hide other step statuses.
- [ ] No final Telegram channel message is sent.
- [ ] No public WordPress post is created.
- [ ] No scheduler is activated.

## 6. Go criteria

The MVP can be considered ready for controlled operation when:

- [ ] Local verification is complete.
- [ ] Cloudflare verification is complete.
- [ ] Secrets verification is complete.
- [ ] Safety verification is complete.
- [ ] Mock E2E smoke passes locally and against the deployed Worker.
- [ ] Controlled pilot readiness-only check passes.
- [ ] Rollback steps are known.
- [ ] Known limitations are accepted.
- [ ] No launch-blocking errors remain.

## 7. No-go criteria

Do not proceed if any of these are true:

- [ ] CI is failing.
- [ ] Lint, typecheck, or tests fail.
- [ ] Worker does not boot.
- [ ] `/health`, `/status`, or `/ready` fails unexpectedly.
- [ ] D1 migrations are incomplete or uncertain.
- [ ] Internal route protection is missing in the deployed environment.
- [ ] Mock E2E smoke fails.
- [ ] Controlled pilot readiness-only check fails.
- [ ] Real providers are enabled unintentionally.
- [ ] Scheduler is enabled unintentionally.
- [ ] Final Telegram publishing is enabled unintentionally.
- [ ] Public WordPress publishing is enabled unintentionally.
- [ ] Sensitive runtime values appear in responses, logs, docs, tests, or PR comments.
- [ ] Rollback path is unknown.

## 8. Rollback steps

If a launch-readiness check fails:

1. Stop additional dry-run or pilot calls.
2. Disable any integration enablement flags used for the check.
3. Return provider mode to mock-safe configuration.
4. Confirm scheduler remains disabled or dry-run guarded.
5. Confirm publishing remains disabled.
6. Check `/health`, `/status`, and `/ready`.
7. Inspect Worker logs without printing sensitive values.
8. Revert the PR or redeploy a known-good commit if needed.
9. Treat D1 rollback as conservative and manual.
10. Record the issue and resolution without sensitive values.

## 9. Branch and PR cleanup guidance

After phase PRs are merged:

- [ ] Delete merged phase branches when no longer needed.
- [ ] Keep `main` protected.
- [ ] Require CI before merge.
- [ ] Keep deploy workflow manual unless a future scoped phase intentionally changes it.
- [ ] Keep migration workflow manual.
- [ ] Keep backup/export workflow as a documented stub until verified.
- [ ] Ensure open PRs do not contain stale implementation plans or secret-looking examples.
- [ ] Confirm final docs match the merged implementation.

Do not delete branches through this checklist. Branch cleanup should be done intentionally by repository maintainers.

## 10. Known limitations accepted for MVP

- [ ] No automatic public launch automation.
- [ ] Real providers are opt-in and not default.
- [ ] No external monitoring or alerting integration.
- [ ] No dashboard.
- [ ] No durable quota system.
- [ ] No production media download pipeline.
- [ ] Production runtime values must be configured by an operator.
- [ ] Real end-to-end public publish must remain manually approved and scoped to a future rollout phase.
