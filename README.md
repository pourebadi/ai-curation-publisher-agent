# AI Curation Publisher Agent

Incremental, provider-agnostic social content curator and publisher for Telegram and WordPress.

This repository implements a staged content pipeline that can ingest public social or web content, normalize provider-specific payloads into a shared model, deduplicate and validate items before expensive processing, generate AI-assisted outputs, route content through Telegram review, queue approved content for publishing, and prepare Telegram and WordPress publishing payloads through mock-safe abstractions.

The project has been built incrementally through Phases 1-21. It is intentionally mock-first: the architecture is shaped for production integrations, but real providers, real Telegram sending, real WordPress publishing, scheduler side effects, and real media processing are not enabled by default.

Phase 21 adds scheduler and production-operations safeguards. The scheduler remains disabled by default, manual scheduler runs stay mock-safe, and publishing/provider side effects remain blocked unless a later scoped phase explicitly changes that behavior. See `docs/SCHEDULER_OPERATIONS.md` for operator guidance.

## Table of contents

- [What this system does](#what-this-system-does)
- [Current implementation status](#current-implementation-status)
- [Architecture overview](#architecture-overview)
- [End-to-end flows](#end-to-end-flows)
- [Lifecycle and state model](#lifecycle-and-state-model)
- [Dedupe and validation](#dedupe-and-validation)
- [Provider system](#provider-system)
- [AI pipeline](#ai-pipeline)
