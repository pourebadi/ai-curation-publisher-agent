# Telegram Topic Workflow MVP Test Guide

This package is prepared for a manual Telegram-first MVP test. It does not require WordPress for the Telegram workflow.

## 1. Required runtime configuration

Set these as Cloudflare Worker secrets or local `.dev.vars` values:

```text
INTERNAL_API_SECRET=<strong-random-secret>
TELEGRAM_BOT_TOKEN=<your-central-bot-token>
TELEGRAM_ALLOWED_REVIEWER_IDS=<your numeric Telegram user id, comma-separated if needed>
AI_PROVIDER=mock|openai|gemini|custom
AI_MODEL=<model id>
OPENAI_API_KEY=<if AI_PROVIDER=openai>
GEMINI_API_KEY=<if AI_PROVIDER=gemini>
TELEGRAM_REAL_REVIEW_ENABLED=true
```

For the first dry manual test, keep final publishing off:

```text
TELEGRAM_FINAL_PUBLISH_ENABLED=false
TELEGRAM_PUBLISH_SCHEDULER_ENABLED=false
```

When review messages are working and queue rows look correct, enable final publishing intentionally:

```text
TELEGRAM_FINAL_PUBLISH_ENABLED=true
TELEGRAM_PUBLISH_SCHEDULER_ENABLED=true
TELEGRAM_PUBLISH_DUE_LIMIT=5
```

## 2. Database migrations

Apply all D1 migrations, including the new MVP additions:

```text
pnpm d1:migrate:local
pnpm d1:migrate:production
```

The important new migration is:

```text
packages/db/migrations/0033_media_processing_jobs.sql
```

## 3. Webhook setup

After the Worker is deployed, set the Telegram webhook:

```text
WORKER_BASE_URL=https://your-worker.workers.dev \
TELEGRAM_BOT_TOKEN=<bot-token> \
node scripts/telegram-set-webhook.mjs
```

Add the bot to:

```text
1. The internal forum supergroup that contains source and review topics.
2. Every final public channel where it needs to publish.
```

The bot needs permission to read/post in the internal group and post in final channels.

## 4. Route setup from dashboard

Open the dashboard, set Worker URL and `INTERNAL_API_SECRET`, then go to:

```text
Settings -> Telegram
```

Use the route builder form for one source topic and multiple language outputs. The MVP form assumes source and review topics are in the same forum supergroup, which matches the quickest manual test setup. If you later want review topics in a different group, use the protected JSON/API route editor and set `reviewChatId` per output.

Example:

```text
Route ID: crypto
Category: crypto
Source chat ID: -100xxxxxxxxxx
Source topic ID: 101
Prompt profile: crypto_editorial

Output FA:
language: fa
review chat ID: -100xxxxxxxxxx
review topic ID: 201
final channel: @crypto_fa
publish mode: scheduled
timezone: Asia/Tehran
allowed window: 09:00-23:00
minimum gap: 10

Output AR:
language: ar
review topic ID: 202
final channel: @crypto_ar

Output EN:
language: en
review topic ID: 203
final channel: @crypto_en
```

Save the route and run route validation from the same page.

## 5. Manual source test

Send a source message into the configured source topic. Start with text-only, then Telegram photo/video, then external links.

Expected result:

```text
One source message
-> one item
-> one generated output per configured language
-> one review message per language review topic
```

Each review message has output-level callback buttons. Pressing Send for FA must only queue/publish FA. AR and EN must remain independent.

## 6. Queue and scheduler test

After pressing Send, check:

```text
GET /internal/telegram/publish/queue?limit=20
```

Or use the dashboard Activity tab.

For scheduled publish, either wait for the Cloudflare scheduled trigger or run manually:

```text
POST /internal/telegram/publish/due
```

The due runner publishes at most one due item per destination per run, so several approved FA posts should be spaced by the FA route output schedule.

## 7. Optional GitHub Actions media processor

Telegram media uploaded directly in the source topic can be reused through Telegram `file_id` without GitHub Actions.

For external media links, enable the GitHub media processor only after the manual Telegram flow works:

Worker vars/secrets:

```text
MEDIA_PROCESSING_MODE=github_actions
GITHUB_MEDIA_PROCESSOR_ENABLED=true
GITHUB_MEDIA_PROCESSOR_REPOSITORY=pourebadi/ai-curation-publisher-agent
GITHUB_MEDIA_PROCESSOR_WORKFLOW_ID=media-processor.yml
GITHUB_MEDIA_PROCESSOR_REF=main
GITHUB_MEDIA_PROCESSOR_CALLBACK_URL=https://your-worker.workers.dev/internal/media/processing/callback
GITHUB_MEDIA_PROCESSOR_TOKEN=<GitHub token with workflow dispatch permission>
TELEGRAM_MEDIA_STAGING_CHAT_ID=<private staging chat/channel id where prepared media can be uploaded>
TELEGRAM_MEDIA_STAGING_THREAD_ID=<optional topic id>
TELEGRAM_MEDIA_MAX_PHOTO_MB=9
TELEGRAM_MEDIA_MAX_FILE_MB=49
```

GitHub Actions secrets in the repository that runs the workflow:

```text
TELEGRAM_BOT_TOKEN
WORKER_INTERNAL_API_SECRET or INTERNAL_API_SECRET
TELEGRAM_MEDIA_CACHE_CHAT_ID or TELEGRAM_MEDIA_STAGING_CHAT_ID
TELEGRAM_MEDIA_CACHE_THREAD_ID or TELEGRAM_MEDIA_STAGING_THREAD_ID, optional
INSTAGRAM_COOKIES_B64, optional
X_COOKIES_B64, optional
```

Useful media processor flags:

```text
MEDIA_PROCESSING_STRICT=false
GITHUB_MEDIA_PROCESSOR_STRICT=false
```

Use false for the first MVP so text-only X/Instagram links do not block publishing. Use true when a route requires external media.

The workflow file is:

```text
.github/workflows/media-processor.yml
```

It uses `yt-dlp`, `ffmpeg`, and Telegram staging upload to convert external media into reusable Telegram `file_id` metadata. It callbacks into the Worker, which stores ready media assets for final publish.

## 8. Smoke script

A safe smoke script is included:

```text
WORKER_BASE_URL=https://your-worker.workers.dev \
INTERNAL_API_SECRET=<secret> \
TEST_REVIEWER_ID=<your-telegram-user-id> \
SOURCE_CHAT_ID=-100xxxxxxxxxx \
SOURCE_THREAD_ID=101 \
REVIEW_CHAT_ID=-100xxxxxxxxxx \
REVIEW_THREAD_ID=201 \
FINAL_CHAT_ID=@crypto_fa \
node scripts/telegram-mvp-smoke.mjs
```

Optional callback/queue/publish simulation:

```text
TEST_SEND=true node scripts/telegram-mvp-smoke.mjs
TEST_SEND=true TEST_RUN_DUE=true node scripts/telegram-mvp-smoke.mjs
```

If you configured `TELEGRAM_WEBHOOK_SECRET`, pass it to the smoke script too so simulated webhook calls include the Telegram secret-token header. Use `TEST_RUN_DUE=true` only after confirming it targets your test group/channel.

## 9. Known MVP boundary

This MVP is designed to get you into manual testing quickly:

```text
- Telegram direct text/photo/video/manual posts: ready for MVP test.
- Multilingual generated outputs: ready for MVP test.
- Independent Send/Cancel/Status and queue per language: ready for MVP test.
- Scheduled due publish: ready for MVP test.
- External media download through GitHub Actions: implemented as optional MVP path. It supports public direct media URLs and yt-dlp-supported X/Instagram links, stages prepared assets into Telegram, and can return multiple file_id assets for valid albums; real-world X/Instagram success may require cookies and depends on platform restrictions.
- WordPress: optional and not required.
```
