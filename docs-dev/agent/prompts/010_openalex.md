# Task: OpenAlex enrichment (later phase)

## Goal

Add Worker-side OpenAlex enrichment (author metrics and works) with the
now-required API key, folded into the roast input.

## Scope

Implement only OpenAlex retrieval through the Worker. This is a later-phase
prompt; run it after `009_orcid` or alongside identifier-based lookup. Do not
implement other data sources.

## Required reading

`docs-dev/reference/primary_authoritative/specification.md`: Domain rules (Later
data sources — OpenAlex; identity on a stable identifier), Architecture
(retrieval via the Worker; Configuration — `OPENALEX_API_KEY`).

## Dependencies

`003_worker_proxy`; ideally `009_orcid` (for an anchored identifier). The first
version (`004`–`008`) is complete.

## Required changes

1. Worker: call OpenAlex server-side with `OPENALEX_API_KEY` as a secret
   (required on every request since 13 February 2026; the polite pool and
   `mailto` were removed). Pull `works_count`, `cited_by_count`,
   `summary_stats.h_index`/`i10_index` (distinct fields — `cited_by_count` is
   total citations, not an h-index) and works.
2. Verify the free allowance and whether single-entity lookups are free at build
   (the docs were inconsistent at the time of writing).
3. Front end: surface the metrics in the editable field for review before
   roasting.

## Do not implement

Do not implement:
- browser-side OpenAlex calls;
- treating `cited_by_count` as an h-index;
- storing fetched data.

## Acceptance criteria

The task is complete when:
- author metrics appear via the Worker with the key requirement handled and the
  distinct metric fields used correctly.

## Automated checks

```bash
npm run check
cd worker && npx wrangler deploy --dry-run
```

## Manual verification

Look up an author by identifier and confirm the correct metrics appear and roast.

## Commit and push

If and only if the scope was followed and checks pass, create one commit on
`main` using this file's exact filename (`010_openalex.md`) as the commit
message, then push.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required five-section final report specified in `AGENTS.md`.
