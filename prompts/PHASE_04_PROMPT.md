# PHASE 4 PROMPT

Read:

- docs/BLUEPRINT.md
- docs/tasks/TASK_04_DEDUPE_AI_PIPELINE.md

Implement AI adapter and Telegram output generation.

Scope:
1. Add generic AI provider interface.
2. Add mock AI provider for tests.
3. Add prompt renderer.
4. Add Telegram prompt template.
5. Add schema validation for Telegram output.
6. Save outputs to DB.
7. Log token/cost estimates.
8. Add tests.

Do not implement WordPress output yet except stubs.
Do not call real AI provider unless environment variables are set and tests use mock.
