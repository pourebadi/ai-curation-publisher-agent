# TASK 07 - Media Pipeline

## Goal

مدیریت image، video و carousel به‌عنوان یک item واحد و آماده‌سازی برای Telegram و WordPress.

## Scope

- media_assets model integration
- image/video download
- yt-dlp
- ffmpeg thumbnail
- compression
- R2 upload
- Telegram media group

## Files / Areas

- apps/media-runner
- packages/media
- .github/workflows/media-process.yml

## Requirements

- هر پست چندمدیایی یک item واحد بماند.
- media_order حفظ شود.
- ویدئو زیر ۴۹MB آماده شود یا fallback شود.
- thumbnail ساخته شود.
- temporary files حذف شوند.
- media errors log شوند.

## Out of Scope

- ذخیره دائم ویدئوهای سنگین
- advanced video editing

## Acceptance Criteria

- single image کار کند.
- single video با thumbnail کار کند.
- carousel به media group تبدیل شود.
- large video fallback داشته باشد.
