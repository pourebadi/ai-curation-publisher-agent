# Social Curator MVP Docs

این بسته شامل فایل‌های Markdown لازم برای شروع پیاده‌سازی پروژه **Incremental Social Content Curator** است.

هدف این بسته این است که بعد از ساخت GitHub repository، این فایل‌ها را داخل repo قرار بدهید و بعد پروژه را مرحله‌به‌مرحله به ChatGPT Pro / Codex / agent کدنویس بدهید تا پیاده‌سازی را شروع کند.

## ساختار فایل‌ها

```text
README.md
.env.example
docs/
  BLUEPRINT.md
  IMPLEMENTATION_PLAN.md
  CODEX_WORKFLOW.md
  ACCEPTANCE_CRITERIA.md
  RUNBOOK.md
  COST_MODEL.md
  ARCHITECTURE_DECISIONS.md
  tasks/
    TASK_01_REPO_BOOTSTRAP.md
    TASK_02_DATABASE_AND_LIFECYCLE.md
    TASK_03_TELEGRAM_MANUAL_REVIEW.md
    TASK_04_DEDUPE_AI_PIPELINE.md
    TASK_05_PUBLISH_TELEGRAM_WORDPRESS.md
    TASK_06_PROVIDER_ADAPTERS.md
    TASK_07_MEDIA_PIPELINE.md
    TASK_08_CLOUDFLARE_GITHUB_DEPLOYMENT.md
prompts/
  START_HERE_PROMPT.md
  PHASE_01_PROMPT.md
  PHASE_02_PROMPT.md
  PHASE_03_PROMPT.md
  PHASE_04_PROMPT.md
  PHASE_05_PROMPT.md
```

## روش پیشنهادی استفاده

1. یک GitHub repository جدید بسازید.
2. این فایل‌ها را در root همان repo کپی کنید.
3. فعلاً هیچ secret واقعی داخل repo نگذارید.
4. فایل `.env.example` را نگه دارید، ولی `.env` واقعی را commit نکنید.
5. در ChatGPT Pro یا Codex، repo را باز کنید یا فایل‌ها را upload کنید.
6. ابتدا محتوای `prompts/START_HERE_PROMPT.md` را به agent بدهید.
7. سپس فقط Phase 1 را شروع کنید.
8. بعد از هر فاز، خروجی را بررسی کنید و فاز بعدی را بدهید.

## قانون مهم

از agent نخواهید کل پروژه را یک‌جا بسازد. این پروژه چند لایه دارد: providerها، Telegram، WordPress، AI، media pipeline، Cloudflare، GitHub Actions و queueها. اگر همه یک‌جا ساخته شود، خروجی احتمالاً ظاهراً بزرگ و از داخل شکننده می‌شود.

## ترتیب پیشنهادی پیاده‌سازی

```text
Phase 1: repo scaffold + core types + D1 migrations + mock provider
Phase 2: Telegram manual ingest + review channel + buttons
Phase 3: dedupe + validation + lifecycle engine
Phase 4: AI adapter + Telegram prompt output
Phase 5: publishing queue + Telegram final publish + WordPress REST publisher
Phase 6: real provider adapters for GetXAPI and Apify
Phase 7: media pipeline with yt-dlp + ffmpeg
Phase 8: Cloudflare Cron, Queues, deployment, monitoring, backup
```

## خروجی MVP

سیستم نهایی باید بتواند محتوای جدید public را از Instagram و X/Twitter دریافت کند، تکراری‌ها را حذف کند، خروجی تلگرام و وردپرس بسازد، در تلگرام برای review بفرستد، بعد از تأیید منتشر کند و همه چیز را لاگ کند.
