# Task: OpenAlex p-index

## Goal

Compute a p-index — the mean citation percentile rank of a researcher's papers
relative to other papers in the same journal and year — from OpenAlex data, and
fold it into the roast input and stats card.

## Scope

Extend only the OpenAlex `/retrieve` path, its text, and its stats. Add no new
source.

## Required reading

`docs-dev/reference/primary_authoritative/specification.md`: Domain rules (Later
data sources — OpenAlex; Roast content, register, and safety), Architecture (The
Worker), Roast output presentation (the stats card).

## Dependencies

`010_openalex` (works with journal source id, year, and citations) and
`016_metrics` (the metrics/stats this extends).

## Required changes

1. For the author's top works, derive each paper's percentile rank within its
   journal-and-year cohort: query OpenAlex works filtered by
   `primary_location.source.id:{sourceId},publication_year:{year}` with
   `group_by=cited_by_count`, and compute the proportion of cohort papers with
   fewer citations (plus half of those with equal citations).
2. Compute the raw p-index as the mean percentile across the author's works, and
   keep the computation pure and testable (a small module, like `metrics.ts`).
3. Append a labelled, factual `p-index` line to the retrieved text and the stats
   object; omit cleanly when journal/year cohorts cannot be resolved. Bound the
   number of cohort lookups so a single retrieval stays cheap.

## Do not implement

Do not implement:
- the authorship-weighted variant (OWPI) unless trivial — note it as deferred;
- any new source or paid/keyed API;
- charts or any visualisation.

## Acceptance criteria

The task is complete when:
- OpenAlex retrieval includes a plausible p-index when cohorts resolve, omitting it
  cleanly otherwise, with the percentile maths verified on a small hand case;
- cohort lookups are bounded so latency stays acceptable;
- the build and Worker dry-run pass.

## Automated checks

```bash
npm run check
cd worker && npx wrangler deploy --dry-run
```

## Manual verification

Retrieve an author with journal publications and confirm the p-index is present and
within 0–100 (or 0–1) as documented; confirm a thin author omits it.

## Commit and push

If and only if the scope was followed and checks pass, create one commit on
`main` using this file's exact filename (`022_openalex_pindex.md`) as the commit
message, then push.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required five-section final report specified in `AGENTS.md`.
