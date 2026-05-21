# TASK 03 - Telegram Manual Ingest and Review

## Goal

ساخت اولین مسیر end-to-end بدون provider واقعی: ورود دستی از Telegram و ارسال به review.

## Scope

- Telegram webhook
- manual text/link ingest
- review message
- inline buttons
- review actions

## Files / Areas

- apps/worker-api/routes/telegram-webhook.ts
- packages/telegram
- packages/db/repositories/review

## Requirements

- Telegram user ID whitelist شود.
- manual input به item تبدیل شود.
- review message شامل caption/source/status باشد.
- buttons: edit/send/cancel/status ساخته شوند.
- callbackها log شوند.

## Out of Scope

- publish نهایی
- WordPress
- AI واقعی

## Acceptance Criteria

- manual message item می‌سازد.
- review message ارسال می‌شود.
- button callbacks status را تغییر می‌دهند.
- unauthorized user reject می‌شود.
