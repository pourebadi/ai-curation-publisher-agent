# PHASE 2 PROMPT

Read:

- docs/BLUEPRINT.md
- docs/IMPLEMENTATION_PLAN.md
- docs/tasks/TASK_03_TELEGRAM_MANUAL_REVIEW.md

Implement Phase 2 only: Telegram manual ingest and review.

Scope:
1. Implement Telegram webhook route.
2. Parse manual text/link input.
3. Create item records from manual input.
4. Send review message to Telegram review channel.
5. Add inline buttons: edit, send, cancel, status.
6. Validate reviewer IDs by whitelist.
7. Log review actions.
8. Add tests for webhook parsing and callback handling.

Do not implement:
- final Telegram publishing
- WordPress publishing
- real providers
- media runner

Keep the PR focused.
