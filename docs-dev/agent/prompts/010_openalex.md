# Task: OpenAlex retrieval (Worker)

## Goal

Add a Worker path that retrieves an author's OpenAlex metrics and works from an
author ID (or OpenAlex URL) and returns them as roast-ready text.

## Scope

Implement only the Worker-side OpenAlex retrieval and its request/response
contract. The user-facing panel is `012_source_input_panel`. Do not implement
other sources.

## Required reading

`docs-dev/reference/primary_authoritative/specification.md`: Domain rules (Source
inputs and validation; Later data sources — OpenAlex), Architecture (retrieval via
the Worker; Configuration — `OPENALEX_API_KEY`).

## Dependencies

`003_worker_proxy`; shares the retrieval contract introduced in `009_orcid`.

## Required changes

1. Worker: accept an OpenAlex author ID or URL and call OpenAlex server-side with
   `OPENALEX_API_KEY` as a secret (required on every request since 13 February
   2026; the polite pool and `mailto` were removed). Pull `works_count`,
   `cited_by_count`, `summary_stats.h_index`/`i10_index` (distinct fields —
   `cited_by_count` is total citations, not an h-index) and works, and assemble
   them into text.
2. Return `{ text }` on success or `{ error, reason }` on failure, matching the
   `009` contract.
3. Verify the free allowance and whether single-entity lookups are free at build
   (the docs were inconsistent at the time of writing).

## Do not implement

Do not implement:
- the front-end panel (`012`);
- treating `cited_by_count` as an h-index;
- ORCID/GitHub or arbitrary scraping; storing fetched data.

## Acceptance criteria

The task is complete when:
- a valid author ID/URL returns assembled metrics + works text via the Worker
  with the key requirement handled and the distinct metric fields used correctly;
- a bad ID returns a clear `{ error, reason }`.

## Automated checks

```bash
npm run build
cd worker && npx wrangler deploy --dry-run
```

## Manual verification

Look up an author by ID/URL and confirm correct metrics; confirm a bad ID returns
the error and reason.

## Commit and push

If and only if the scope was followed and checks pass, create one commit on
`main` using this file's exact filename (`010_openalex.md`) as the commit
message, then push.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required five-section final report specified in `AGENTS.md`.
