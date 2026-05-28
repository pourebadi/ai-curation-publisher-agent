# Phase 7 Final Test Report

Generated: 2026-05-28T21:45:07.153388+00:00

## Scope

This report covers the Phase 7 staging validation for:

- Category wizard and simplified prompt manager
- One prompt per category/language output
- Gemini structured AI output
- Gemini fallback model behavior
- Telegram review and publish flow
- Social media processing for X/Twitter and Instagram
- Multi-photo handling
- Telegram-safe video preparation

## Branch

`test/dashboard-phase7-category-wizard-prompts`

## Environment

Staging Worker:

`https://ai-curation-publisher-agent-staging.mpourebadi.workers.dev`

## Key fixes validated

### 1. AI output validation

Problem found:

`sourceAttributionText` was required to be a non-empty string, but the product requirement allows it to be empty when the source URL should not be shown in the caption.

Fix:

`sourceAttributionText` is now allowed to be an empty string.

Result:

AI outputs now persist as valid generated outputs instead of falling back to:

`تولید کپشن این پست کامل نشد...`

### 2. Gemini fallback model

Problem found:

`gemini-2.5-flash` may intermittently return 503/high-demand errors.

Fix:

Gemini provider can fall back to:

`gemini-2.5-flash-lite`

Result:

Recent staging outputs show successful generation with both:

- `gemini-2.5-flash`
- `gemini-2.5-flash-lite`

### 3. X/Twitter multi-photo handling

Problem found:

Some X multi-photo posts were downloaded as short still video wrappers and then uploaded to Telegram as video/document-like files.

Fixes:

- Detect still-video wrappers
- Extract first frame as JPEG
- Upload converted stills as Telegram `photo`, not document
- Preserve multi-asset media group metadata

Result:

X multi-photo test now stores assets as:

- `kind: photo`
- `telegramFileType: photo`
- Telegram file IDs beginning with photo-style IDs

### 4. Instagram video playback

Problem found:

Some Instagram reels uploaded to Telegram played with audio while the image stayed frozen.

Fix:

Added Telegram-safe video compatibility checks and transcode path for incompatible video characteristics.

Result:

Instagram 60fps reels are detected as requiring safe transcode.

### 5. fps=30 enforcement for Telegram-safe transcode

Problem found:

The pipeline could mark a video as Telegram-safe-transcoded while still reporting `preparedFrameRate: 60`.

Fix in this patch:

When `transcode_video(..., reason="telegram_safe")` runs, the ffmpeg filter now includes:

`fps=30`

Result expected:

New Telegram-safe transcodes should report:

- `preparedFrameRate <= 30`
- `preparedPixelFormat: yuv420p`
- `preparedVideoCodec: h264`

## Regression test set

### Text-only post

Input:

`برای تست: بیت‌کوین امروز دوباره بالای محدوده مهم بازار معامله می‌شود و معامله‌گران منتظر شکست مقاومت بعدی هستند.`

Expected:

- Persian output
- No fallback
- No media job required

### X video

URL:

`https://x.com/i/status/2057120818551734589`

Expected:

- `telegramFileType: video`
- No aspect drift
- Playable in Telegram

### X multi-photo

URL:

`https://x.com/i/status/2055414662116585612`

Expected:

- `assetCount: 3`
- all assets `telegramFileType: photo`
- no document upload
- no black video wrappers

### Instagram 60fps reel

URL:

`https://www.instagram.com/reel/DVZtZunjev9/?igsh=MW05ZjFnc2FrbTlrbQ==`

Expected after this patch:

- `telegramSafeVideoTranscodeRequired: true`
- `transcoded: true`
- `preparedFrameRate <= 30`

### Instagram 30fps reel

URL:

`https://www.instagram.com/reel/DYFSaPnxFQq/?igsh=YzMyeGw2aWg2bGg5`

Expected:

- `telegramSafeVideoTranscodeRequired: false`
- avoid unnecessary heavy transcode
- playable in Telegram

## Debug policy

Raw AI/debug capture should remain available in code paths because it was critical for identifying the validation issue quickly.

Do not remove debug capability.

Future cleanup should move raw AI diagnostics into `provider_logs` / `prompt_runs` rather than user-facing caption fields.

## Remaining follow-up

- Move AI raw debug payloads from generated output fields into dedicated observability tables.
- Add dashboard-only debug inspection for AI validation failures.
- Consider staging cron override for faster publish testing.
- Prepare PR and merge after final publish verification.
