# Phase 7.2 Prompt Single Source Patch

## What changed
- AI output parser now accepts common aliases such as caption/summary/title and normalizes them to the Telegram schema.
- Prompt map upsert enforces one active prompt per route output.
- Older prompt profiles for the same category/language are archived when a simple prompt is saved.
- Prompt map now prefers exact route output bindings over broader category/language bindings.

## Operational note
For current staging data, run the cleanup SQL in the assistant instructions so crypto_fa points only to crypto_fa_editorial.
