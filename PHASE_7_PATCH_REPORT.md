# Phase 7 Patch Report: Category Wizard and Simple Prompt Manager

## Summary

This patch makes the dashboard easier for non-technical operators by adding category-first automation and a simplified prompt workflow.

The main goal is to avoid asking operators to type raw route IDs, output IDs, prompt profile IDs, binding IDs, content types, versions, or status values for daily work.

## What changed

### Category Wizard

Added a new `Categories` dashboard tab for:

- Viewing category health and output coverage.
- Creating a new category with source topic, languages, review topics, final channels, prompts, and publish defaults.
- Adding a new language output to an existing category.
- Automatically creating route outputs, prompt profiles, and prompt bindings.

### Simple Prompt Manager

The `Prompts` page now defaults to a simple mode:

- Pick a category and language output.
- Edit only the useful fields: prompt text, user prompt template, negative prompt, temperature, max tokens, risk policy, and style guide.
- Save once; the backend automatically creates/updates the prompt profile and binding.
- Advanced Prompt Studio remains available behind an explicit button.

### Negative Prompt

Added `negative_prompt` support to prompt profiles:

- New D1 migration: `0036_prompt_negative_prompt.sql`.
- Repository support for reading/writing `negativePrompt`.
- Dashboard forms support negative prompt editing.
- Runtime prompt rendering appends negative instructions to the system message.

### Backend endpoints

Added:

- `GET /internal/admin/categories`
- `POST /internal/admin/categories/preview`
- `POST /internal/admin/categories/create`
- `POST /internal/admin/categories/:category/add-language`
- `GET /internal/admin/prompt-map`
- `POST /internal/admin/prompt-map/upsert`

## Important notes

- This is a practical operator UX patch, not a full persistent topic registry.
- Topic dropdowns are derived from existing routes, outputs, and known topology.
- Advanced prompt versioning/diff/history remains available but is hidden from the default simple workflow.

## Checks performed

Full dependency install was unavailable in this execution environment because registry access for package manager setup was blocked. Targeted TypeScript checks were run with temporary local stubs.

Relevant worker files showed no new errors. Dashboard changed files showed no new substantive errors beyond expected temporary stub limitations around React key props and legacy dashboard files.

Run the full checks in Codespaces:

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm test
```

## Recommended manual test

1. Open dashboard.
2. Go to `Categories`.
3. Create a test category with one language.
4. Confirm route/output/prompt/binding are created.
5. Go to `Prompts`.
6. Edit the prompt in simple mode and save.
7. Confirm prompt is connected in category health/prompt map.
8. Send a source link into that category source topic.
9. Confirm review output uses the saved prompt.
