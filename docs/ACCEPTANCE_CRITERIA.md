# Acceptance Criteria

این فایل معیارهای پذیرش MVP و هر فاز را مشخص می‌کند.

---

## MVP Acceptance Criteria

### Ingestion

- sourceها با typeهای profile، hashtag، query، direct_url، web_url و manual در دیتابیس پشتیبانی می‌شوند.
- سیستم برای هر source، watermark ذخیره می‌کند.
- providerها پشت adapter هستند.
- fallback provider قابل تنظیم است.
- خروجی providerها به schema واحد normalize می‌شود.

### Dedupe

- duplicateها قبل از AI حذف می‌شوند.
- duplicateها قبل از media processing حذف می‌شوند.
- duplicateها وارد review channel نمی‌شوند.
- mapping بین source_post_id و generated outputs ذخیره می‌شود.

### AI

- همه itemهای جدید و معتبر خروجی Telegram می‌گیرند.
- WordPress output فقط برای itemهای approved ساخته می‌شود.
- promptها versioned هستند.
- خروجی AI schema-valid است.
- token/cost usage ثبت می‌شود.

### Telegram

- manual input از Telegram کار می‌کند.
- review message ساخته می‌شود.
- دکمه‌های edit/send/cancel/status کار می‌کنند.
- edit روی همان item ذخیره می‌شود.
- send باعث ورود به publish_queue می‌شود.
- cancel item را از چرخه publish خارج می‌کند.

### WordPress

- بعد از publish موفق Telegram، WordPress output ساخته می‌شود.
- پست WordPress از REST API ساخته می‌شود.
- title، excerpt، body_html، tags، category، featured image/source link ثبت می‌شود.
- WordPress failure باعث publish دوباره Telegram نمی‌شود.

### Media

- image، video و carousel پشتیبانی می‌شوند.
- همه مدیاهای یک پست در یک item واحد باقی می‌مانند.
- ویدئو زیر ۴۹MB آماده می‌شود یا fallback دارد.
- thumbnail ساخته می‌شود.
- media errors لاگ می‌شوند.

### Operations

- GitHub Actions CI وجود دارد.
- deploy workflow وجود دارد.
- migration workflow وجود دارد.
- provider smoke test وجود دارد.
- backup workflow وجود دارد.
- health endpoint وجود دارد.

---

## Phase Acceptance Criteria

### Phase 1

- repo scaffold کامل است.
- TypeScript build پاس می‌شود.
- tests پاس می‌شوند.
- D1 migrations وجود دارند.
- core types و lifecycle statuses تعریف شده‌اند.
- mock provider خروجی normalized می‌دهد.

### Phase 2

- Telegram webhook تست‌پذیر است.
- manual ingest item می‌سازد.
- review message و buttons ساخته می‌شوند.
- callbackها auth دارند.

### Phase 3

- dedupe service تست دارد.
- validation service تست دارد.
- duplicate item وارد AI نمی‌شود.

### Phase 4

- AI adapter قابل تعویض است.
- Telegram output schema validate می‌شود.
- output در DB ذخیره می‌شود.

### Phase 5

- publish queue کار می‌کند.
- Telegram final publish انجام می‌شود.
- WordPress draft ساخته می‌شود.

### Phase 6+

- real providers فقط از adapterها وارد سیستم می‌شوند.
- provider failure باعث fallback می‌شود.
- provider logs ثبت می‌شوند.
