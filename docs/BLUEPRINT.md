# Technical Product Blueprint
## Incremental Social Content Curator for Telegram + WordPress

**Version:** 1.0  
**MVP platforms:** Instagram, X/Twitter, Telegram, WordPress  
**Primary control surface:** Telegram  
**Repository:** GitHub monorepo  

---

## 1. Product Definition

MVP یک سیستم **incremental, provider-agnostic social content curator** است که پست‌های جدید منابع عمومی را از Instagram و X/Twitter دریافت می‌کند، قبل از هر هزینه AI یا پردازش سنگین dedupe و validation انجام می‌دهد، سپس همه پست‌های جدید و معتبر را وارد AI processing می‌کند، خروجی جدا برای Telegram و WordPress تولید می‌کند، محتوا را برای تأیید انسانی به کانال خصوصی Telegram می‌فرستد و پس از approval، محتوا را در کانال نهایی Telegram و سایت WordPress منتشر می‌کند.

اصل بنیادین:

```text
Fetch incrementally → normalize → dedupe → validate → AI/process → review → publish
```

سیستم نباید هر بار history را دوباره بخواند یا محتوای تکراری را دوباره ترجمه، دانلود، بازنویسی یا منتشر کند.

---

## 2. MVP Scope

### داخل MVP

- Instagram public profile monitoring
- Instagram hashtag crawling
- Instagram direct post/reel URL
- X/Twitter public profile monitoring
- X/Twitter hashtag crawling
- X/Twitter query search
- Web URL extraction
- Manual content/link input from Telegram
- Provider abstraction and failover
- Dedupe before AI and media processing
- AI output for Telegram
- AI output for WordPress
- Telegram review flow
- Telegram final publishing
- WordPress publishing through REST API + Application Password
- Image/video/carousel handling
- GitHub Actions for CI/CD and media processing
- Cloudflare Workers, Cron, Queues, D1, R2

### خارج از MVP

- Private profiles
- Auto-publish بدون تأیید انسانی
- Full dashboard
- Publishing to Instagram/LinkedIn/Reddit/YouTube
- Permanent heavy video archive
- Advanced semantic dedupe
- Complex WordPress plugin

---

## 3. Core Architecture

```text
Sources
  ↓
Provider Adapters
  ↓
Incremental Poller
  ↓
Normalize + Dedupe + Validation
  ↓
Processing Queue
  ↓
AI Telegram Output
  ↓
Media Pipeline
  ↓
Telegram Review Channel
  ↓
Human Approval / Edit / Cancel
  ↓
Publishing Queue
  ↓
Telegram Final Channel
  ↓
AI WordPress Output
  ↓
WordPress Publisher
  ↓
Logs + Metrics + Archive
```

---

## 4. Infrastructure Decisions

| Layer | Decision |
|---|---|
| API/webhook | Cloudflare Workers |
| Scheduler | Cloudflare Cron |
| Queue | Cloudflare Queues |
| DB/state | Cloudflare D1 |
| Media cache | Cloudflare R2 |
| Short-lived config/action | KV فقط در صورت نیاز؛ نه state اصلی |
| Media processing | GitHub Actions یا self-hosted runner با yt-dlp + ffmpeg |
| CI/CD | GitHub Actions |
| Review/publish operations | Telegram Bot API |
| WordPress | REST API + Application Password |
| AI | Provider-agnostic API adapter |

---

## 5. Repository Structure

```text
social-content-curator/
  README.md
  package.json
  pnpm-workspace.yaml
  turbo.json
  wrangler.toml
  .env.example

  apps/
    worker-api/
      src/
        index.ts
        routes/
          telegram-webhook.ts
          health.ts
        handlers/
          review-callback.ts
          manual-ingest.ts
        queues/
          processing-consumer.ts
          publishing-consumer.ts
        scheduled/
          poller.ts

    media-runner/
      src/
        process-media.ts
        download.ts
        thumbnail.ts
        compress.ts

    cli/
      src/
        seed-sources.ts
        provider-smoke-test.ts
        backfill.ts

  packages/
    core/
    db/
    providers/
    ai/
    telegram/
    wordpress/
    media/
    scheduler/
    observability/

  docs/
  .github/workflows/
```

---

## 6. Provider Abstraction

هیچ کدی خارج از provider adapter نباید response shape یک سرویس خاص را بشناسد.

```ts
export interface SocialProvider {
  id: string;
  platform: Platform;
  capabilities: ProviderCapabilities;
  fetchSource(input: FetchSourceInput): Promise<ProviderFetchResult>;
  fetchDirectUrl?(url: string): Promise<ProviderFetchResult>;
  healthCheck(): Promise<ProviderHealthResult>;
}
```

Provider priority:

```json
{
  "instagram": ["apify_instagram", "hikerapi", "rapidapi_instagram"],
  "x": ["getxapi", "apify_x", "socialcrawl"],
  "web": ["firecrawl", "simple_extractor"]
}
```

Normalized post shape:

```ts
export type NormalizedPost = {
  provider: string;
  platform: 'instagram' | 'x' | 'web' | 'manual';
  sourceType: 'profile' | 'hashtag' | 'query' | 'direct_url' | 'web_url' | 'manual';
  sourcePostId?: string;
  canonicalUrl: string;
  publishedAt?: string;
  authorHandle?: string;
  text?: string;
  links: string[];
  media: NormalizedMedia[];
  rawPayload: unknown;
};
```

---

## 7. Incremental Ingestion

هر source باید watermark داشته باشد:

```text
last_seen_post_id
last_seen_at
provider_cursor
last_successful_poll_at
```

Backfill پیشنهادی:

```json
{
  "instagram_profile_posts": 12,
  "x_profile_posts": 20,
  "instagram_hashtag_posts": 30,
  "x_hashtag_or_query_posts": 30
}
```

Polling روزانه/چندباره:

```json
{
  "instagram_profile_limit_per_source": 6,
  "x_profile_limit_per_source": 10,
  "instagram_hashtag_limit_per_source": 20,
  "x_query_limit_per_source": 30,
  "max_items_per_run": 500
}
```

Watermark فقط بعد از fetch موفق، normalize موفق، ذخیره itemها و dedupe keyها update می‌شود.

---

## 8. Dedupe Strategy

Dedupe قبل از AI، media، review و publish اجرا می‌شود.

| Layer | Key |
|---|---|
| exact | platform + source_post_id |
| URL | canonical_url_hash |
| text | normalized_text_hash |
| media | media_url_hash |
| fallback | source + published_at + text_hash |

اگر duplicate باشد:

- AI اجرا نمی‌شود.
- media دانلود نمی‌شود.
- review ارسال نمی‌شود.
- WordPress output ساخته نمی‌شود.

---

## 9. Data Model Summary

Essential tables:

```text
sources
items
dedupe_keys
media_assets
prompts
outputs
review_messages
publish_queue
wordpress_posts
provider_logs
review_actions
settings
```

Item lifecycle:

```text
discovered → normalized → validated → queued_for_ai → ai_processed → media_ready → sent_to_review → approved → queued_for_publish → published_telegram → published_wordpress → archived
```

Failure states:

```text
duplicate_skipped
invalid
failed
retry_pending
cancelled
```

---

## 10. AI Pipeline

AI provider باید قابل تعویض باشد:

```ts
export interface AiProvider {
  id: string;
  generateStructured(input: AiRequest): Promise<AiResponse>;
}
```

همه پست‌های جدید، معتبر و dedupe‌شده وارد AI Telegram Prompt می‌شوند.

WordPress output فقط بعد از approval ساخته می‌شود تا برای آیتم‌های لغوشده هزینه اضافی مصرف نشود.

Telegram output schema:

```json
{
  "language_detected": "en",
  "telegram_caption_fa": "string",
  "summary_fa": "string",
  "hashtags": ["string"],
  "risk_flags": ["string"],
  "relevance_score": 0.85,
  "quality_score": 0.8
}
```

WordPress output schema:

```json
{
  "title": "string",
  "slug": "string",
  "excerpt": "string",
  "body_html": "string",
  "meta_description": "string",
  "tags": ["string"],
  "category": "string",
  "source_attribution": "string"
}
```

---

## 11. Media Pipeline

Rules:

- فقط برای پست‌های جدید، معتبر و eligible مدیا دانلود شود.
- همه مدیاهای یک پست در یک item واحد بمانند.
- carousel نباید به چند پست جدا تبدیل شود.
- ویدئو باید زیر ۴۹MB آماده شود.
- اگر ویدئو قابل آماده‌سازی نبود، thumbnail + source link استفاده شود.

Telegram mapping:

| Content | Method |
|---|---|
| text only | sendMessage |
| one image | sendPhoto |
| one video | sendVideo |
| multiple media | sendMediaGroup |

---

## 12. Telegram Review Flow

Review buttons:

```text
✏️ ویرایش
🚀 ارسال
❌ لغو
📊 وضعیت
```

Optional:

```text
🔁 پردازش دوباره متن
🎬 تلاش مجدد مدیا
🌐 پیش‌نمایش وردپرس
```

MVP edit flow:

```text
/edit
متن اصلاح‌شده
```

Bot باید reply parent را تشخیص دهد، item را پیدا کند، `edited_caption` را ذخیره کند و همان پیام review را update کند.

---

## 13. Publishing Flow

بعد از `🚀 ارسال`:

```text
item.status = approved
create publish_queue for telegram
publish according to schedule
on telegram success → generate WordPress output
create/publish WordPress post
```

پیشنهاد MVP:

```text
WordPress publish after successful Telegram publish
WordPress default_status = draft
```

---

## 14. WordPress Publisher

اتصال رایگان:

```text
WordPress REST API + Application Password
```

Flow:

```text
1. Generate WordPress output.
2. Upload featured image to /wp/v2/media.
3. Create post via /wp/v2/posts.
4. Set status = draft or publish.
5. Store wordpress_post_id and wordpress_url.
```

---

## 15. GitHub Actions

Workflows required:

```text
ci.yml
deploy-worker.yml
migrate-d1.yml
provider-smoke-test.yml
media-process.yml
backup.yml
```

GitHub Actions should handle:

- lint/typecheck/test
- deploy Cloudflare Worker
- D1 migrations
- provider smoke tests
- media processing with yt-dlp/ffmpeg
- scheduled backup/export

GitHub Actions should not handle:

- main state
- Telegram webhook
- primary long-term queue state

---

## 16. Failure Behavior

| Failure | Behavior |
|---|---|
| Provider rate limit | backoff + fallback |
| Provider schema changed | mark unhealthy + fallback + alert |
| Duplicate returned | skip before AI |
| AI timeout | retry with backoff |
| AI invalid JSON | repair once, then fail |
| Media download failed | retry, then thumbnail/link fallback |
| Telegram 429 | respect retry_after |
| WordPress auth fail | permanent fail + alert |
| WordPress publish fail | retry WordPress only, do not republish Telegram |

---

## 17. Cost Controls

Rules:

```text
Do not AI-process duplicates.
Do not media-process duplicates.
Do not WordPress-generate cancelled items.
Do not refetch full history.
Do not retry providers infinitely.
Do not download video before validation.
```

Metrics:

```text
provider_call_count
provider_returned_count
unique_new_count
duplicate_count
ai_processed_count
media_success_count
telegram_published_count
wordpress_published_count
cost_estimate_daily
cost_estimate_monthly
overfetch_ratio
```

Budget target for MVP:

```text
Safe monthly budget: $5–$15
```

---

## 18. Build Order for Coding Agent

```text
1. Monorepo setup
2. D1 schema + migrations
3. Core types + lifecycle statuses
4. Mock provider
5. Telegram webhook + review buttons
6. Manual ingest
7. Dedupe + validation
8. AI adapter + Telegram prompt
9. Processing queue
10. Telegram publish queue
11. WordPress REST publisher
12. Media model + image handling
13. GitHub Actions media runner
14. Real providers: GetXAPI + Apify
15. Cron poller
16. Cost metrics + alerts
17. Backup + deploy workflows
```
