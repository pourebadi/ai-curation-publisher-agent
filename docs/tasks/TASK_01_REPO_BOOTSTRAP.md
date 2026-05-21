# TASK 01 - Repository Bootstrap

## Goal

ساخت اسکلت اولیه monorepo و آماده کردن پروژه برای توسعه مرحله‌ای.

## Scope

- pnpm workspace
- TypeScript config
- Cloudflare Worker scaffold
- core package types
- D1 migrationهای اولیه
- mock provider
- CI workflow

## Files / Areas

- package.json
- pnpm-workspace.yaml
- turbo.json
- wrangler.toml
- apps/worker-api
- packages/core
- packages/db
- packages/providers
- .github/workflows/ci.yml

## Requirements

- هیچ API واقعی وصل نشود.
- هیچ secret واقعی commit نشود.
- core types برای Source, Item, MediaAsset, Output, Provider, QueuePayload ساخته شود.
- lifecycle statuses مرکزی تعریف شود.
- D1 migrations بر اساس BLUEPRINT ایجاد شود.
- mock provider خروجی NormalizedPost بدهد.
- README setup نوشته شود.

## Out of Scope

- Telegram واقعی
- WordPress واقعی
- AI واقعی
- yt-dlp/ffmpeg
- providerهای واقعی

## Acceptance Criteria

- pnpm install کار کند.
- pnpm typecheck پاس شود.
- pnpm test پاس شود.
- CI workflow تعریف شده باشد.
- D1 migrationها وجود داشته باشند.
- mock provider تست داشته باشد.
