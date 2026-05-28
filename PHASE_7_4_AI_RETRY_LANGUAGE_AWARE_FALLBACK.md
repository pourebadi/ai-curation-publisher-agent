# Phase 7.4 AI retry and language-aware fallback

## Fix
- Gemini temporary failures are retried with short backoff.
- Provider 503 no longer escapes into topic-ingest fallback.
- Safe fallback is generated in the target output language.
- Technical provider/parser errors are stripped before Telegram review preview.

## Notes
This does not translate when Gemini is unavailable. It prevents broken English/error captions and asks for retry in the target language.
