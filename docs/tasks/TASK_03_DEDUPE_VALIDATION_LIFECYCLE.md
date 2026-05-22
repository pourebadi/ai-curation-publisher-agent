# TASK 03: Dedupe, Validation, and Lifecycle Engine

## Goal

Implement the Phase 3 foundation for dedupe, raw validation, lifecycle transitions, and cost-control gates before any AI, media, review, or publishing work.

This phase must not implement AI generation, real providers, media processing, WordPress publishing, final Telegram publishing, scheduling, or dashboard work.

## Scope

### 1. Dedupe key generation

Implement utilities/services for generating dedupe keys:

- exact post key: `platform + source_post_id`
- canonical URL hash
- normalized text hash
- media URL hash where media exists
- fallback composite key: `source + published_at + text_hash`

### 2. Dedupe repository/service

Implement functions for:

- checking whether a dedupe key already exists
- recording dedupe keys for new items
- returning the existing item when a duplicate is found
- preventing duplicate items from entering AI/media/review queues

### 3. Validation service

Validate raw/manual/provider items before expensive work.

Validation must check:

- canonical URL exists where required
- source_post_id or fallback identity exists
- content has at least one of text, media, or link
- platform is valid
- source_type is valid
- item has enough data to proceed

Invalid items must be marked as `invalid`.

### 4. Lifecycle transition guard

Implement explicit lifecycle transition rules for:

- discovered
- normalized
- duplicate_skipped
- invalid
- validated
- queued_for_ai

Invalid transitions should fail clearly.

### 5. Manual ingest integration

Integrate dedupe and validation into the existing manual Telegram ingest flow.

Required behavior:

- duplicate items become `duplicate_skipped`
- invalid items become `invalid`
- valid new items move `discovered → normalized → validated → queued_for_ai`
- duplicate and invalid items must not create review messages
- duplicate and invalid items must not enter AI/media/review queues

### 6. Tests

Add tests for:

- dedupe key generation
- duplicate detection
- validation failures
- valid item lifecycle path
- invalid lifecycle transitions
- manual ingest duplicate path
- manual ingest invalid path

## Out of scope

Do not implement:

- real AI processing
- real provider polling
- real media download
- real publishing
- WordPress publishing
- scheduler/cron
- dashboard
- full semantic duplicate detection

## Acceptance criteria

- Dedupe runs before expensive processing.
- Duplicate items are not queued for AI/media/review.
- Invalid items are marked invalid with useful reasons.
- Valid items can reach `queued_for_ai`.
- Tests pass.
- README documents Phase 3 behavior.