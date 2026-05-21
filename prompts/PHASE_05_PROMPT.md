# PHASE 5 PROMPT

Read:

- docs/BLUEPRINT.md
- docs/tasks/TASK_05_PUBLISH_TELEGRAM_WORDPRESS.md

Implement publishing queue, final Telegram publish, and WordPress REST draft creation.

Scope:
1. Add publish_queue service.
2. Add schedule resolver.
3. Add final Telegram publisher.
4. Add WordPress REST client.
5. Add WordPress prompt/output generation.
6. Create WordPress draft after successful Telegram publish.
7. Ensure WordPress failure does not duplicate Telegram publish.
8. Add tests.

Do not implement real providers or heavy media pipeline in this phase.
