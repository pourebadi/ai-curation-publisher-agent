# START HERE PROMPT

You are acting as a senior full-stack product engineer and technical architect.

This repository contains a complete technical product blueprint for an incremental, provider-agnostic social content curator. Before writing code, read these files completely:

- docs/BLUEPRINT.md
- docs/IMPLEMENTATION_PLAN.md
- docs/ARCHITECTURE_DECISIONS.md
- docs/ACCEPTANCE_CRITERIA.md
- docs/CODEX_WORKFLOW.md

Project goal:
Build an incremental social content curator that ingests new public posts from Instagram and X/Twitter sources, deduplicates and validates them before expensive processing, generates AI outputs for Telegram and WordPress, sends items to a private Telegram review channel, allows human approval/edit/cancel/status actions, publishes approved items to a final Telegram channel, and then publishes a longer WordPress version through the WordPress REST API.

Important rules:
- Do not implement the entire project in one pass.
- Work phase by phase.
- Do not hardcode provider-specific logic into core business logic.
- Use provider adapters.
- Do not process duplicate content.
- Do not run AI before dedupe and validation.
- WordPress output must be separate from Telegram output.
- WordPress publishing must use the free WordPress REST API + Application Password approach.
- Telegram is the main operational interface for MVP.
- No standalone dashboard is required in MVP.
- Use mocks before real third-party providers.
- Do not require real API keys for the first phase.
- Create clear README setup instructions.
- Create .env.example but never commit secrets.
- Include tests for critical logic.

First, summarize your understanding of the system and list the phases you will implement. Then wait for the Phase 1 prompt.
