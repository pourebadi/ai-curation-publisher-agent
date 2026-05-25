# Agent workflow

This repository uses a PR-first automation workflow.

## Goals

- Keep `main` protected.
- Avoid direct pushes to `main`.
- Run CI on every pull request.
- Allow routine safe PRs to auto-merge after CI passes.
- Keep automated work reviewable.

## Standard flow

1. Open GitHub Actions.
2. Run `Agent Task PR`.
3. Enter a task title and task body.
4. The workflow creates a branch.
5. The workflow opens a pull request to `main`.
6. CI runs automatically.
7. If CI passes and the branch is allowed, auto-merge is enabled.

## Required validation

The required CI job is:

```text
Lint, typecheck, test, and build
