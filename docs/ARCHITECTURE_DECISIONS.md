# Architecture Decisions

این فایل تصمیم‌های معماری قطعی را ثبت می‌کند.

---

## ADR-001: Provider-agnostic core

تصمیم: core system نباید به provider خاصی وابسته باشد.

دلیل: Apify، HikerAPI، GetXAPI، RapidAPI و SocialCrawl ممکن است قیمت، محدودیت، schema یا availability خود را تغییر دهند.

نتیجه: همه providerها باید adapter داشته باشند.

---

## ADR-002: D1 as primary state database

تصمیم: Cloudflare D1 دیتابیس اصلی MVP است.

دلیل: state، item lifecycle، dedupe، queue status، settings و logs نیاز به query و persistence دارند.

نتیجه: KV برای state اصلی استفاده نمی‌شود.

---

## ADR-003: Telegram as main operational UI

تصمیم: Telegram پنل عملیاتی MVP است.

دلیل: review، edit، send، cancel و status می‌توانند بدون dashboard مستقل انجام شوند.

نتیجه: dashboard کامل خارج از MVP است.

---

## ADR-004: WordPress from MVP

تصمیم: WordPress از MVP در معماری لحاظ می‌شود.

دلیل: خروجی WordPress prompt، schema، media و publishing متفاوت از Telegram است.

نتیجه: هر item خروجی چندپلتفرمی دارد.

---

## ADR-005: WordPress REST API + Application Password

تصمیم: اتصال رایگان به WordPress از طریق REST API و Application Password انجام می‌شود.

دلیل: نیاز به پلاگین پولی نیست و API رسمی WordPress کافی است.

نتیجه: WordPress plugin اختصاصی فقط در فازهای بعدی و در صورت نیاز ساخته می‌شود.

---

## ADR-006: Media processing outside Cloudflare Worker

تصمیم: ویدئو، yt-dlp و ffmpeg داخل GitHub Actions یا self-hosted runner اجرا می‌شود.

دلیل: Cloudflare Worker برای پردازش ویدئوی سنگین مناسب نیست.

نتیجه: Worker فقط orchestrator است.

---

## ADR-007: WordPress output after approval

تصمیم: خروجی WordPress فقط بعد از approval ساخته می‌شود.

دلیل: متن WordPress طولانی‌تر است و هزینه AI بیشتری دارد. برای item لغوشده نباید هزینه شود.

نتیجه: همه itemهای valid خروجی Telegram می‌گیرند؛ فقط approvedها خروجی WordPress می‌گیرند.
