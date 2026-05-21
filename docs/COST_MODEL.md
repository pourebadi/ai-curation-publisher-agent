# Cost Model

هدف این فایل شفاف‌سازی هزینه‌های MVP است.

---

## 1. Cost Categories

| دسته | توضیح |
|---|---|
| Provider crawl/scrape | Apify, HikerAPI, GetXAPI, SocialCrawl, RapidAPI |
| AI processing | Telegram prompt + WordPress prompt |
| Media processing | GitHub Actions/self-hosted runner compute |
| Storage | D1, R2, WordPress media |
| Telegram | رایگان |
| WordPress REST API | رایگان |
| Cloudflare Free | هدف MVP صفر دلار |

---

## 2. اصل هزینه‌ای سیستم

هزینه باید قبل از هر پردازش سنگین کنترل شود:

```text
fetch → normalize → dedupe → validate → AI/media
```

هیچ duplicate نباید وارد AI یا media processing شود.

---

## 3. Metrics لازم

```text
provider_call_count
provider_returned_count
unique_new_count
duplicate_count
invalid_count
ai_processed_count
wordpress_generated_count
media_processed_count
telegram_published_count
wordpress_published_count
cost_estimate_daily
cost_estimate_monthly
```

فرمول‌ها:

```text
overfetch_ratio = provider_returned_count / unique_new_count
cost_per_unique_item = total_provider_cost / unique_new_count
ai_cost_per_item = total_ai_cost / ai_processed_count
```

---

## 4. Budget Guardrails

Config پیشنهادی:

```json
{
  "monthly_budget_usd": 15,
  "daily_ai_budget_usd": 1,
  "daily_provider_budget_usd": 1,
  "max_provider_retries": 2,
  "skip_ai_if_duplicate": true,
  "reuse_existing_outputs": true,
  "wordpress_output_after_approval_only": true
}
```

اگر budget تمام شد:

- polling می‌تواند ادامه پیدا کند اما AI queue pause شود.
- admin در Telegram alert بگیرد.
- itemها در `queued_for_ai` باقی بمانند.

---

## 5. هزینه تخمینی MVP

سناریو پایه:

```text
20 Instagram profiles
20 X profiles
hashtag/query فعال اما محدود
```

بودجه امن:

```text
$5 تا $15 در ماه
```

شرط‌ها:

- incremental polling
- dedupe before AI
- WordPress output only after approval
- no permanent heavy video archive
- provider retry محدود
