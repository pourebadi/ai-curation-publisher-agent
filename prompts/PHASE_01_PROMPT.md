# PHASE 1 PROMPT

Read:

- docs/BLUEPRINT.md
- docs/IMPLEMENTATION_PLAN.md
- docs/tasks/TASK_01_REPO_BOOTSTRAP.md

Implement Phase 1 only.

Scope:
1. Create the monorepo/project structure.
2. Add pnpm workspace configuration.
3. Add TypeScript configuration.
4. Add Cloudflare Worker scaffold.
5. Add shared core types for items, sources, media, providers, outputs, lifecycle statuses, queues, and settings.
6. Add D1 migration files based on the blueprint.
7. Add repository/service layer stubs.
8. Add mock provider adapter.
9. Add basic Telegram webhook route stub.
10. Add GitHub Actions CI workflow for lint/typecheck/test.
11. Add README with local setup instructions.

Do not implement:
- real Instagram/X provider calls
- real AI provider calls
- real WordPress calls
- yt-dlp/ffmpeg media processing
- production Telegram publishing

Before coding:
- Propose the exact file tree you will create.
- Confirm what is in scope and out of scope.

After coding:
- Explain how to run tests.
- Explain how to run the Worker locally.
- List what Phase 2 should do next.
