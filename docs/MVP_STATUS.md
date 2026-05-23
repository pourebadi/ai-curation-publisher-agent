# MVP Status

This document summarizes the current MVP readiness state for the AI Curation Publisher Agent after Phases 1-22.

The project is ready for controlled operator verification. It is not configured for unattended production automation by default.

## Summary

The MVP includes a complete mock-first curation and publishing architecture:

- manual Telegram ingest
- provider-normalized source ingestion with mock providers
- dedupe and validation before expensive work
- lifecycle guards
- AI output abstraction with mock-safe tests
- Telegram review flow
- publishing queue abstraction
- final Telegram publishing abstraction
- WordPress publishing abstraction
- media preparation abstraction
- Cloudflare Worker operational routes
- dry-run routes for Firecrawl, Telegram review, and WordPress draft creation
- controlled pilot route for sequential integration readiness checks
- scheduler safeguards with disabled-by-default behavior

The MVP does not enable public production automation by default.

## Area status

| Area | Status | Notes |
| --- | --- | --- |
| Core lifecycle | Implemented | Item lifecycle guards exist for the staged content flow. |
| Dedupe | Implemented | Dedupe helpers and gate behavior prevent duplicate work before expensive processing. |
| Validation | Implemented | Raw/normalized content validation is part of the ingest path. |
| Manual ingest | Implemented | Telegram text and URL manual ingest are supported. |
| AI output | Implemented with mock-safe defaults | AI pipeline is abstracted; tests do not require real AI calls. |
| Telegram review | Implemented | Review messages and callback handling exist. |
| Telegram final publishing | Abstraction implemented; real final publish not default | Final publishing remains mock-safe unless a future scoped rollout changes it. |
| WordPress publishing | Abstraction implemented; draft dry-run only for real path | Public WordPress publishing is not enabled by default. |
| Media pipeline | Implemented as preparation abstraction | No real production media download/upload is enabled by default. |
| Providers | Mock providers implemented; real stubs gated | Real providers are disabled unless explicitly configured for sandbox checks. |
| Firecrawl sandbox | Opt-in dry-run | Single Web/Firecrawl sandbox path exists for controlled direct URL checks. |
| Telegram review dry-run | Opt-in dry-run | Real review-channel check is explicit and does not send final channel messages. |
| WordPress dry-run | Opt-in draft dry-run | Real WordPress path creates drafts only when explicitly enabled and configured. |
| Scheduler | Safeguarded; disabled by default | Scheduled handler skips unless enabled and remains guarded. |
| Controlled pilot | Implemented; explicit opt-in steps | Combined pilot coordinates Firecrawl, Telegram review, and WordPress draft checks only when requested. |
| Cloudflare deployment | Configured for dry-run operations | Worker config and workflows support controlled deployment checks. |
| D1 database | Repository and migration support implemented | Remote production database must be created and migrated by the operator. |
| Monitoring/alerts | Not production-integrated | No external monitoring or alerting service is wired. |
| Dashboard | Not implemented | No dashboard is included in the MVP. |

## Mock-only behavior

These areas remain mock-only by default:

- provider polling
- AI provider calls in tests and local smoke flows
- final Telegram publishing
- WordPress publishing in tests and default local flows
- media processing
- E2E smoke scenario

## Dry-run-only behavior

These areas support controlled dry-runs but are not production-enabled by default:

- Firecrawl/Web sandbox fetch
- Telegram review-channel dry-run
- WordPress draft creation dry-run
- controlled real integrations pilot

## Opt-in real integration checks

The following checks may be run manually by an operator after runtime configuration is intentionally set:

- Firecrawl direct URL sandbox check
- Telegram review-channel dry-run
- WordPress draft-only dry-run
- combined controlled pilot using explicitly requested steps

These checks do not enable scheduler automation, final Telegram publishing, public WordPress publishing, or media processing.

## Not production-enabled

The following remain intentionally disabled or absent:

- automatic production scheduler side effects
- automatic real provider polling
- public WordPress publishing
- final Telegram channel publishing by default
- real media download/upload pipeline
- durable quota system
- external monitoring or alerting integration
- dashboard
- fully automated launch workflow

## What remains after MVP

Recommended post-MVP work:

1. Run a controlled Cloudflare deployment dry-run.
2. Run the MVP launch checklist.
3. Verify remote D1 migrations.
4. Run mock E2E smoke checks against the deployed Worker.
5. Run controlled pilot readiness-only check.
6. Run individual real integration dry-runs only when needed.
7. Add external monitoring and alerting.
8. Add durable quota and rate-limit storage if production traffic requires it.
9. Plan a scoped rollout for real provider polling.
10. Plan a scoped rollout for real final publishing.

## Launch criteria

Launch readiness requires all of the following:

- CI is green.
- `pnpm lint` passes.
- `pnpm typecheck` passes.
- `pnpm test` passes.
- Worker boots locally.
- `/health`, `/status`, and `/ready` pass locally.
- Mock E2E pipeline passes.
- Remote D1 database exists.
- Migrations are applied to the intended environment.
- Cloudflare deployment succeeds.
- Deployed `/health`, `/status`, and `/ready` pass.
- Internal route protection is configured for deployed internal routes.
- Controlled pilot readiness-only check passes.
- No real secrets or secret-looking placeholders are committed.
- Scheduler remains disabled or dry-run guarded.
- Real providers remain disabled unless intentionally running a scoped dry-run.
- No public publishing path is enabled by default.
- Rollback path is known.

## No-launch criteria

Do not launch if any of the following are true:

- CI is failing.
- Worker readiness fails in the target environment.
- D1 migrations are incomplete or uncertain.
- Internal route protection is not configured for a deployed environment.
- Any response or log exposes sensitive runtime values.
- Scheduler is enabled unintentionally.
- Real providers are enabled unintentionally.
- Final Telegram publishing is enabled unintentionally.
- Public WordPress publishing is enabled unintentionally.
- Mock E2E smoke scenario fails.
- Rollback steps are unknown.

## Operator references

- `docs/MVP_LAUNCH_CHECKLIST.md`
- `docs/RUNBOOK.md`
- `docs/PRODUCTION_DRY_RUN.md`
- `docs/CONTROLLED_REAL_INTEGRATIONS_PILOT.md`
- `docs/SCHEDULER_OPERATIONS.md`
- `docs/TELEGRAM_REVIEW_DRY_RUN.md`
- `docs/WORDPRESS_DRY_RUN.md`
