# Implementation Plan

این فایل مسیر اجرایی پروژه را مرحله‌به‌مرحله مشخص می‌کند. هدف این است که agent کدنویس پروژه را به فازهای کوچک، قابل تست و قابل review تقسیم کند.

---

## Phase 1: Repository Bootstrap

هدف: ساخت اسکلت پروژه بدون اتصال واقعی به providerها.

خروجی‌ها:

- monorepo با pnpm workspace
- TypeScript config
- Cloudflare Worker scaffold
- packageهای core/db/providers/ai/telegram/wordpress/media/scheduler/observability
- D1 migrationهای اولیه
- lifecycle statuses
- mock provider
- Telegram webhook stub
- GitHub Actions CI
- README و `.env.example`

نباید در این فاز ساخته شود:

- اتصال واقعی Instagram/X
- اتصال واقعی WordPress
- AI واقعی
- media download واقعی

---

## Phase 2: Telegram Manual Ingest + Review

هدف: قبل از providerهای واقعی، بتوانیم از Telegram یک لینک یا متن دستی بگیریم و به review channel بفرستیم.

خروجی‌ها:

- Telegram webhook واقعی
- manual ingest handler
- ساخت item از لینک/متن دستی
- review message builder
- inline keyboard برای edit/send/cancel/status
- whitelist reviewer IDs
- review_actions logging

---

## Phase 3: Dedupe + Validation + Lifecycle Engine

هدف: قبل از AI و media processing، dedupe و validation دقیق داشته باشیم.

خروجی‌ها:

- dedupe service
- canonical URL hashing
- text normalization/hash
- media URL hash
- validation service
- lifecycle transition guard
- tests برای duplicate و invalid states

---

## Phase 4: AI Pipeline

هدف: خروجی Telegram با AI adapter تولید شود، بدون وابستگی به Gemini یا OpenAI.

خروجی‌ها:

- generic AI provider interface
- prompt renderer
- schema validator
- Telegram prompt
- outputs table integration
- token/cost logging
- mock AI provider for tests

---

## Phase 5: Telegram + WordPress Publishing

هدف: بعد از approval، پست در Telegram منتشر شود و سپس WordPress output ساخته و به WordPress ارسال شود.

خروجی‌ها:

- publishing queue
- schedule resolver
- Telegram final publisher
- WordPress REST client
- WordPress prompt output
- WordPress draft post creation
- failure handling برای WordPress بدون duplicate Telegram publish

---

## Phase 6: Real Provider Adapters

هدف: اتصال providerهای واقعی بعد از آماده شدن pipeline داخلی.

اولویت:

1. XGetXApiProvider
2. InstagramApifyProvider
3. WebFirecrawlProvider یا simple extractor
4. Fallback providerها

خروجی‌ها:

- provider registry
- provider priority/fallback
- provider logs
- smoke test command
- source polling

---

## Phase 7: Media Pipeline

هدف: image/video/carousel را درست مدیریت کنیم.

خروجی‌ها:

- media_assets integration
- image download
- video download با yt-dlp
- thumbnail با ffmpeg
- compression زیر ۴۹MB
- R2 upload
- Telegram media group handling
- GitHub Actions media-process workflow

---

## Phase 8: Cloudflare + Deployment + Observability

هدف: production-ready MVP.

خروجی‌ها:

- Cloudflare Cron
- Cloudflare Queues
- deploy-worker.yml
- migrate-d1.yml
- provider-smoke-test.yml
- backup.yml
- health check
- admin alerts to Telegram
- cost metrics
- runbook نهایی

---

## اصل اجرای فازها

هر فاز باید:

- branch جدا داشته باشد.
- PR جدا داشته باشد.
- تست داشته باشد.
- README یا docs را update کند.
- قبل از شروع فاز بعدی merge شود.

هیچ فازی نباید سعی کند همه چیز را با هم بسازد.
