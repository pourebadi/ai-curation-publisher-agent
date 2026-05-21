# Operations Runbook

این runbook برای نگهداری و debug سیستم بعد از MVP است.

---

## 1. Health Check

Endpoint پیشنهادی:

```text
GET /health
```

باید برگرداند:

```json
{
  "status": "ok",
  "environment": "production",
  "db": "ok",
  "queues": "ok",
  "telegram": "ok",
  "wordpress": "ok"
}
```

---

## 2. اضافه کردن source

MVP command پیشنهادی در Telegram:

```text
/source add instagram profile openai priority=high limit=6
/source add x hashtag AI mode=top limit=30
/source add x query "AI product design" mode=recent limit=30
```

اگر command هنوز ساخته نشده، source با seed script اضافه شود.

---

## 3. بررسی وضعیت item

```text
/status item_123
```

خروجی باید شامل این موارد باشد:

```text
Status
Provider used
AI status
Media status
Review status
Telegram publish status
WordPress publish status
Last error
```

---

## 4. Retryها

```text
/retry item_123
/retry_media item_123
/regen item_123 target=telegram
/regen item_123 target=wordpress
```

---

## 5. Provider failure

اگر provider fail شد:

1. provider_logs را چک کن.
2. health check provider را اجرا کن.
3. اگر rate limit بود، backoff را فعال نگه دار.
4. اگر schema عوض شده، adapter را آپدیت کن.
5. اگر provider کاملاً fail شد، priority را تغییر بده.

---

## 6. Telegram publish failure

1. اگر 429 بود، retry_after را رعایت کن.
2. اگر media مشکل داشت، fallback thumbnail/source link را فعال کن.
3. اگر bot permission ندارد، admin permission کانال‌ها را چک کن.

---

## 7. WordPress failure

1. Application Password را چک کن.
2. user role را چک کن.
3. REST API endpoint را تست کن.
4. اگر media upload fail شد، post را بدون featured image به draft بفرست یا retry کن.
5. Telegram publish را تکرار نکن.

---

## 8. Backup

Backupهای روزانه باید شامل این‌ها باشند:

- D1 export
- settings
- prompts
- sources
- item lifecycle history
- provider logs

R2 temporary media لازم نیست دائم backup شود.

---

## 9. Rollback

- Worker را به نسخه قبلی deploy کن.
- migrationها باید backward-compatible باشند.
- قبل از production migration، backup بگیر.
- destructive migration در MVP ممنوع است.
