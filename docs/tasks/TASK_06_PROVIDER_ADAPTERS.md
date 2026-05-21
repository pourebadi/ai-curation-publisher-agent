# TASK 06 - Real Provider Adapters

## Goal

اتصال providerهای واقعی برای X و Instagram بدون وابسته کردن core به vendorها.

## Scope

- XGetXApiProvider
- InstagramApifyProvider
- WebFirecrawlProvider/simple extractor
- provider registry
- fallback logic
- provider logs

## Files / Areas

- packages/providers
- apps/worker-api/scheduled/poller.ts
- packages/observability

## Requirements

- هر provider capabilities اعلام کند.
- responseها normalize شوند.
- provider failure باعث fallback شود.
- provider_logs پر شود.
- source watermark فقط بعد از موفقیت update شود.

## Out of Scope

- crawler اختصاصی با proxy
- private profiles

## Acceptance Criteria

- mock smoke tests پاس شوند.
- real provider با env key قابل تست باشد.
- fallback تست داشته باشد.
- returned/unique/duplicate count log شود.
