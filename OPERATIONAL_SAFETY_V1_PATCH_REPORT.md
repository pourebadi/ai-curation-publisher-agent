# Operational Safety V1 Patch Report

This patch builds on the Media V3 package and focuses on publish safety, item traceability, prompt run logging, dedupe debugging, and media job inspection.

## Implemented

- Added publish preview endpoint: `POST /internal/telegram/publish/preview`.
- Enriched publish queue rows with media status, asset counts, prompt status, category and route/output context.
- Added backend publish blocker checks before `Publish now` runs.
- Added due publishing outcome counters: checked, published, skipped and failed.
- Added item timeline endpoint: `GET /internal/admin/timeline`.
- Added dedupe search endpoint: `POST /internal/admin/test-data/dedupe-search`.
- Added prompt run logging MVP for real and mock output generation.
- Added media job detail card in the dashboard with workflow run link, timings, assets, dimensions, drift and raw payload.
- Added publish preview card in the dashboard showing caption, media, prompt, blockers and warnings.
- Added Activity timeline UI for item/queue/output/URL lookup.
- Added dedupe search and URL reset controls to Diagnostics.

## Safety behavior

`Publish now` now asks the backend for a preview before sending to the final channel. If media is pending, partial or failed without fallback policy, the backend blocks immediate publishing.

## Notes

Prompt run logging is an MVP. Runs are recorded when output generation happens. If a generated output ID is not known at prompt execution time, later preview/timeline resolution falls back to item ID and prompt profile matching.

## Tests run in this environment

- `python3 -m py_compile scripts/media_processor.py scripts/media/process_media.py`
- `node --check scripts/media-processor.mjs`
- `tsc -b packages/core packages/db packages/telegram apps/worker-api --pretty false` with temporary local type stubs for missing dependencies.
- `tsc -p apps/dashboard/tsconfig.json --pretty false` with temporary local type stubs. The modified dashboard files were clean; the remaining failures are pre-existing implicit `event` type errors in older dashboard files (`App.tsx`, `RestoredDashboardApp.tsx`, `admin-config-editor.tsx`).

Temporary stubs and generated `dist` directories were removed before packaging.

## Remaining work

- Full prompt preview with Raw / Parsed / Final / Validation.
- Persistent topic registry.
- Category-first setup wizard.
- Remote GitHub workflow cancellation.
- Real fallback provider implementation for Instagram/X.
- Rich publish modal using a proper dialog component instead of browser confirm.
