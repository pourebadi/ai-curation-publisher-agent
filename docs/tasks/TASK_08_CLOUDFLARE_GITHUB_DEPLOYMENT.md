# TASK 08 - Cloudflare and GitHub Deployment

## Goal

آماده‌سازی MVP برای staging/production با deploy، migration، backup، monitoring و recovery.

## Scope

- Cloudflare Cron
- Cloudflare Queues
- deploy workflow
- migration workflow
- backup workflow
- provider smoke tests
- alerts

## Files / Areas

- wrangler.toml
- .github/workflows
- apps/worker-api/scheduled
- packages/observability

## Requirements

- staging و production جدا باشند.
- secrets در GitHub/Cloudflare باشند.
- health endpoint وجود داشته باشد.
- backup روزانه D1 تعریف شود.
- rollback strategy README شود.

## Out of Scope

- dashboard کامل
- multi-tenant

## Acceptance Criteria

- deploy staging کار کند.
- migration دستی کار کند.
- backup workflow اجرا شود.
- health check ok بدهد.
- Telegram alert برای خطاهای مهم ارسال شود.
