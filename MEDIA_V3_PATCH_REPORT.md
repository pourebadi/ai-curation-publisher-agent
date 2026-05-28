# Media V3 Reliability and Debug Patch Report

## Summary

This patch focuses on the media workflow: download speed, aspect preservation, callback consistency, item-level review readiness, duplicate review prevention, dashboard traceability, retry/cancel actions, and media debug tooling.

## Key fixes

- Reviewed the previous Media V2 patch and kept the progressive MP4/aspect-safe direction.
- Added item-level media readiness aggregation before sending media-ready reviews.
- Prevented duplicate media-ready reviews by checking existing Telegram review messages.
- Ignored late callbacks for jobs cancelled from the dashboard.
- Marked Telegram-native `file_id` assets as ready instead of pending.
- Canonicalized the worker callback path to `/internal/media/processing/callback`.
- Adapted legacy `/internal/media/jobs/complete` when it receives a modern job/assets payload.
- Added GitHub run ID/URL callbacks and dashboard links.
- Added download/prepare/upload/total timing metadata.
- Added detailed per-asset dimension metadata and aspect drift warnings.
- Added media URL debug panel in the dashboard.
- Added retry/cancel controls for media jobs.
- Added optional fallback provider endpoint before yt-dlp fallback.
- Optimized the workflow to skip apt install when ffmpeg is already available and cache pip.

## Tests run

- `python3 -m py_compile scripts/media_processor.py scripts/media/process_media.py`
- `node --check scripts/media-processor.mjs`
- `tsc -b packages/core packages/db packages/telegram apps/worker-api --pretty false` with local temporary stubs for missing external type packages.
- `tsc -p apps/dashboard/tsconfig.json --noEmit --pretty false` with local temporary React/Vitest stubs. This reached only pre-existing implicit-any errors in old dashboard files outside the modified media dashboard path.
- Local synthetic media integration checks:
  - vertical MP4 aspect preservation
  - generated 4-photo album preparation
  - generated 3-video album preparation
  - X/Twitter fallback URL candidate generation

## Not run

Live Instagram/X/Twitter end-to-end tests were not run because this environment has no live Telegram credentials, GitHub Actions runtime, cookies, or social provider access. The patch includes the workflow and callback hooks required for live staging validation.

## Follow-up recommended

- Run a staging job with a real Instagram reel URL and compare original/prepared/Telegram dimensions in the dashboard.
- Run a staging job with a real X post containing four photos.
- Run a staging job with a carousel/album containing multiple videos.
- Add item-level media timeline to the dashboard.
- Add remote GitHub workflow cancellation via GitHub API if needed.
