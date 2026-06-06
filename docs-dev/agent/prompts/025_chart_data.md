# Task: Structured chart data from retrieval

## Goal

Return chart-ready structured data from the OpenAlex retrieval — publications and
citations per year, open-access breakdown, top co-author countries, and top venues
— alongside the existing text and stats, so the front end can plot it and the
analysis step can reason over it.

## Scope

Extend only the OpenAlex `/retrieve` path and its JSON response. Compute and return
data; do not render anything (charts are `027_charts`) and do not analyse trends
(that is `026_trend_analysis`).

## Required reading

`docs-dev/reference/primary_authoritative/specification.md`: Domain rules (Later
data sources — OpenAlex; Source inputs and validation), Architecture (The Worker;
Data flow and statelessness), Roast output presentation.

## Dependencies

`010_openalex` (author + works), `016_metrics`, and `019_openalex_enrichment` (the
open-access and country aggregations to reuse).

## Required changes

1. Read the author's `counts_by_year` into a `{ year, works, citations }` series
   (publications and citations per year).
2. Reuse the `019` `group_by` results for the open-access breakdown
   (`{ status, count }`) and co-author countries (`{ country, count }`), and add a
   top-venues series via `group_by=primary_location.source.id` resolved to source
   display names (`{ venue, count }`).
3. Add a `charts` object to the `/retrieve` JSON response holding these bounded
   arrays (e.g. `citationsPerYear`, `worksPerYear`, `openAccess`, `topCountries`,
   `topVenues`); omit any series whose data is absent. Keep arrays small and the
   Worker stateless (nothing stored).

## Do not implement

Do not implement:
- any rendering, SVG, or charting (that is `027_charts`);
- the trend-analysis text (that is `026_trend_analysis`);
- a new source or any keyed/paid API; storing fetched data.

## Acceptance criteria

The task is complete when:
- OpenAlex retrieval returns a `charts` object with correct per-year, OA, country,
  and venue series when data exists, omitting empties cleanly;
- the series match a small hand check against the author/works data;
- the build and Worker dry-run pass.

## Automated checks

```bash
npm run check
cd worker && npx wrangler deploy --dry-run
```

## Manual verification

Retrieve a well-known OpenAlex author and confirm the `charts` arrays are present
and plausible; confirm a sparse author omits empty series.

## Commit and push

If and only if the scope was followed and checks pass, create one commit on
`main` using this file's exact filename (`025_chart_data.md`) as the commit
message, then push.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required five-section final report specified in `AGENTS.md`.
