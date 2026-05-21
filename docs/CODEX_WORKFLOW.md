# Codex / ChatGPT Pro Workflow

این فایل توضیح می‌دهد چطور این repo را به ChatGPT Pro / Codex بدهید تا پروژه مرحله‌به‌مرحله ساخته شود.

---

## روش پیشنهادی

1. یک GitHub repository جدید بسازید.
2. این فایل‌ها را در root repo قرار دهید.
3. یک branch به نام `dev` بسازید.
4. ChatGPT Pro / Codex را به repo وصل کنید یا فایل‌ها را داخل Project upload کنید.
5. ابتدا prompt فایل `prompts/START_HERE_PROMPT.md` را بدهید.
6. بعد فقط `prompts/PHASE_01_PROMPT.md` را بدهید.
7. بعد از خروجی هر فاز:
   - diff را بررسی کنید.
   - تست‌ها را اجرا کنید.
   - اگر خوب بود merge کنید.
   - بعد فاز بعدی را بدهید.

---

## قانون طلایی

هرگز از agent نخواهید «کل پروژه را بسازد».  
هر بار فقط یک فاز.

بدترین پرامپت:

```text
این سند را بخوان و کل برنامه را کامل بساز.
```

بهترین پرامپت:

```text
این سند را بخوان و فقط Phase 1 را طبق TASK_01 انجام بده. هیچ provider واقعی را وصل نکن.
```

---

## ترتیب Promptها

```text
1. prompts/START_HERE_PROMPT.md
2. prompts/PHASE_01_PROMPT.md
3. prompts/PHASE_02_PROMPT.md
4. prompts/PHASE_03_PROMPT.md
5. prompts/PHASE_04_PROMPT.md
6. prompts/PHASE_05_PROMPT.md
```

برای فازهای بعدی، از فایل‌های task داخل `docs/tasks/` استفاده کنید.

---

## وقتی agent خروجی داد چه چک کنیم؟

- آیا چیزی خارج از scope فاز ساخته؟
- آیا secret hardcode کرده؟
- آیا تست دارد؟
- آیا README را آپدیت کرده؟
- آیا کد provider خاص را داخل core hardcode کرده؟
- آیا D1 migrationها واضح‌اند؟
- آیا lifecycle statusها مطابق blueprint هستند؟

---

## اگر agent از مسیر خارج شد

این را بفرستید:

```text
Stop. You are implementing outside the current phase scope. Re-read docs/IMPLEMENTATION_PLAN.md and docs/tasks/TASK_XX.md. Revert unrelated changes and keep this PR focused only on the current task.
```
