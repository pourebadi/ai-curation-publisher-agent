# TASK 04 - Dedupe, Validation, and AI Pipeline

## Goal

اطمینان از اینکه هیچ آیتم تکراری یا invalid وارد AI نمی‌شود و خروجی Telegram schema-valid تولید می‌شود.

## Scope

- dedupe service
- validation service
- AI adapter
- prompt renderer
- Telegram output schema
- cost/token logging

## Files / Areas

- packages/core
- packages/ai
- packages/db/repositories/outputs

## Requirements

- dedupe قبل از AI اجرا شود.
- AI provider interface قابل تعویض باشد.
- mock AI provider برای تست ساخته شود.
- خروجی با schema validate شود.
- outputs table پر شود.

## Out of Scope

- WordPress output
- real AI provider optional only behind adapter
- media download

## Acceptance Criteria

- duplicate وارد AI نمی‌شود.
- valid item خروجی Telegram می‌گیرد.
- invalid AI JSON fail کنترل‌شده دارد.
- token/cost estimate ذخیره می‌شود.
