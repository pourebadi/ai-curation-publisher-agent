# راهنمای سریع تست MVP تلگرام

این نسخه برای تست دستی سریع آماده شده است. WordPress برای این مسیر لازم نیست.

## 1. نصب و migration

```bash
corepack enable
corepack prepare pnpm@9.15.4 --activate
pnpm install
pnpm d1:migrate:local
# برای production:
pnpm d1:migrate:production
```

## 2. Secretها و تنظیمات Worker

حداقل موارد لازم:

```text
INTERNAL_API_SECRET=<secret>
TELEGRAM_BOT_TOKEN=<bot token>
TELEGRAM_ALLOWED_REVIEWER_IDS=<your numeric telegram user id>
TELEGRAM_REAL_REVIEW_ENABLED=true
AI_PROVIDER=mock
AI_MODEL=mock
```

برای تست اول، publish نهایی را خاموش نگه دارید:

```text
TELEGRAM_FINAL_PUBLISH_ENABLED=false
TELEGRAM_PUBLISH_SCHEDULER_ENABLED=false
```

بعد از اینکه review و queue درست کار کرد:

```text
TELEGRAM_FINAL_PUBLISH_ENABLED=true
TELEGRAM_PUBLISH_SCHEDULER_ENABLED=true
TELEGRAM_PUBLISH_DUE_LIMIT=5
```

## 3. webhook تلگرام

```bash
WORKER_BASE_URL=https://your-worker.workers.dev \
TELEGRAM_BOT_TOKEN=<bot-token> \
node scripts/telegram-set-webhook.mjs
```

Bot باید در این جاها عضو/ادمین باشد:

```text
1. گروه داخلی forum که source و review topicها داخل آن هستند.
2. کانال‌های public نهایی، مثل @crypto_fa و @crypto_en.
```

## 4. تعریف route از dashboard

در dashboard، Worker URL و `INTERNAL_API_SECRET` را وارد کنید. سپس بروید به:

```text
Settings -> Telegram -> MVP route builder
```

مدل route:

```text
Crypto Source Topic
→ output fa → Crypto FA Review → @crypto_fa
→ output ar → Crypto AR Review → @crypto_ar
→ output en → Crypto EN Review → @crypto_en
```

Save را بزنید و سپس route validation را اجرا کنید.

## 5. تست دستی واقعی

در source topic یک پیام ساده بفرستید. اول text-only تست کنید، بعد photo/video مستقیم تلگرام، بعد لینک خارجی.

انتظار درست:

```text
یک پیام source
→ یک item
→ چند generated output بر اساس زبان‌های route
→ یک review message در topic هر زبان
```

اگر روی Send خروجی فارسی بزنید، فقط همان خروجی فارسی queue/publish می‌شود. عربی و انگلیسی مستقل می‌مانند.

## 6. بررسی queue و اجرای due publish

از dashboard Activity یا این endpoint استفاده کنید:

```text
GET /internal/telegram/publish/queue?limit=20
```

برای اجرای دستی publishهای due:

```text
POST /internal/telegram/publish/due
```

Runner در هر اجرا برای هر final channel/topic فقط یک آیتم due منتشر می‌کند تا چند Send پشت سر هم یک‌دفعه به کانال نروند.

## 7. فعال‌سازی media processor برای X/Instagram/linkهای ویدئویی

بعد از اینکه flow دستی تلگرام درست شد، media processor را فعال کنید:

Worker env/secrets:

```text
MEDIA_PROCESSING_MODE=github_actions
GITHUB_MEDIA_PROCESSOR_ENABLED=true
GITHUB_MEDIA_PROCESSOR_REPOSITORY=pourebadi/ai-curation-publisher-agent
GITHUB_MEDIA_PROCESSOR_WORKFLOW_ID=media-processor.yml
GITHUB_MEDIA_PROCESSOR_REF=main
GITHUB_MEDIA_PROCESSOR_CALLBACK_URL=https://your-worker.workers.dev/internal/media/processing/callback
GITHUB_MEDIA_PROCESSOR_TOKEN=<github token with workflow dispatch permission>
TELEGRAM_MEDIA_STAGING_CHAT_ID=<private staging chat/channel id>
TELEGRAM_MEDIA_STAGING_THREAD_ID=<optional topic id>
TELEGRAM_MEDIA_MAX_PHOTO_MB=9
TELEGRAM_MEDIA_MAX_FILE_MB=49
MEDIA_PROCESSING_STRICT=false
```

GitHub Actions secrets در ریپویی که workflow را اجرا می‌کند:

```text
TELEGRAM_BOT_TOKEN
WORKER_INTERNAL_API_SECRET یا INTERNAL_API_SECRET
TELEGRAM_MEDIA_CACHE_CHAT_ID یا TELEGRAM_MEDIA_STAGING_CHAT_ID
TELEGRAM_MEDIA_CACHE_THREAD_ID یا TELEGRAM_MEDIA_STAGING_THREAD_ID، اختیاری
INSTAGRAM_COOKIES_B64، اختیاری
X_COOKIES_B64، اختیاری
```

`MEDIA_PROCESSING_STRICT=false` باعث می‌شود لینک‌های social بدون مدیای قابل دانلود، workflow را fail نکنند. وقتی خواستید وجود media اجباری باشد، آن را true کنید.

## 8. smoke script سریع

```bash
WORKER_BASE_URL=https://your-worker.workers.dev \
INTERNAL_API_SECRET=<secret> \
TEST_REVIEWER_ID=<your telegram user id> \
SOURCE_CHAT_ID=-100xxxxxxxxxx \
SOURCE_THREAD_ID=101 \
REVIEW_CHAT_ID=-100xxxxxxxxxx \
REVIEW_THREAD_ID=201 \
FINAL_CHAT_ID=@crypto_fa \
node scripts/telegram-mvp-smoke.mjs
```

برای شبیه‌سازی Send و اجرای due publish:

```bash
TEST_SEND=true TEST_RUN_DUE=true node scripts/telegram-mvp-smoke.mjs
```

این اسکریپت جای تست واقعی گروه و topic را نمی‌گیرد، اما سریع نشان می‌دهد route، webhook، generated output، callback و queue به هم وصل هستند.
