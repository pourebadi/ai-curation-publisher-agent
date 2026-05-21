# TASK 05 - Publishing Telegram and WordPress

## Goal

بعد از approval، آیتم وارد publishing queue شود، در Telegram منتشر شود و WordPress draft ساخته شود.

## Scope

- publish_queue
- schedule resolver
- Telegram final publisher
- WordPress REST client
- WordPress prompt output

## Files / Areas

- packages/scheduler
- packages/telegram/publisher.ts
- packages/wordpress
- packages/ai/prompts/wordpress

## Requirements

- send button item را approved کند.
- schedule resolver زمان انتشار تعیین کند.
- Telegram publish status ذخیره شود.
- بعد از Telegram success، WordPress output ساخته شود.
- WordPress post با REST API ساخته شود.
- WordPress failure باعث duplicate Telegram publish نشود.

## Out of Scope

- real media carousel کامل
- providerهای واقعی

## Acceptance Criteria

- approved item در publish_queue می‌رود.
- Telegram final publish mock/real کار می‌کند.
- WordPress draft mock/real کار می‌کند.
- failure handling تست دارد.
