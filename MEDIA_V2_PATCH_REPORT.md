# Media V2 Patch Report

## Summary

This patch focuses on the media-processing bottleneck and playback correctness issues reported with Instagram Reels and other social media sources.

## Fixed in this patch

- Optimized yt-dlp format preference to avoid unnecessary split video/audio downloads when progressive MP4 is available.
- Added concurrent fragment download support for faster large video downloads.
- Increased media extraction cap to Telegram's 10-item media-group limit.
- Preserved carousel/source order instead of sorting downloaded files by size.
- Added faststart MP4 remuxing for streaming-friendly Telegram playback.
- Re-encoded only when required by size/aspect/rotation constraints.
- Fixed aspect safety with longest-side scaling and `setsar=1`; no square crop is applied.
- Added video width/height/duration metadata to Telegram cache upload callbacks.
- Added `supports_streaming`, width, height, and duration metadata when reusing video file IDs for review/final sends.
- Added grouped media asset IDs for multi-asset callbacks.
- Expanded worker dispatch asset limit from 3 to a configurable max of 10.
- Added media job output details to the internal media jobs endpoint and dashboard asset-count column.
- Documented the new media behavior in `docs/MEDIA_PROCESSOR_V2_FAST_ASPECT_SAFE.md`.

## Files changed

- `.github/workflows/media-processor.yml`
- `scripts/media_processor.py`
- `scripts/media/process_media.py`
- `scripts/media-processor.mjs`
- `packages/telegram/src/real-telegram-client.ts`
- `apps/worker-api/src/telegram-topic-workflow/media-processing-orchestrator.ts`
- `apps/worker-api/src/routes/internal-media-jobs.ts`
- `apps/dashboard/src/ModernDashboardApp.tsx`
- `docs/MEDIA_PROCESSOR_V2_FAST_ASPECT_SAFE.md`

## Testing performed

- `python3 -m py_compile scripts/media_processor.py`
- `python3 -m py_compile scripts/media/process_media.py`
- `node --check scripts/media-processor.mjs`
- `tsc --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --noEmit packages/telegram/src/real-telegram-client.ts`

Full monorepo build was not possible in this sandbox because workspace dependencies are not installed and pnpm is not available. Targeted syntax/type checks for modified standalone scripts and Telegram client passed.

## Remaining phase 2 work

- Add a dashboard media debug page for one source URL.
- Store and link GitHub workflow run URLs.
- Add retry/cancel job actions to the Media tab.
- Add real extractor timing metrics: download seconds, upload seconds, total workflow seconds.
- Add automated integration tests with sample vertical MP4, carousel photos, and mixed photo/video albums.
