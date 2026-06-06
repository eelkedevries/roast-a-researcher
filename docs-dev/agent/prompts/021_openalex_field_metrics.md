# Task: OpenAlex field-weighted metrics

## Goal

Add field-normalised impact to the OpenAlex retrieval: a field-weighted citation
impact (FWCI) figure and a mean journal-citedness (impact-factor proxy), folded
into the roast input and the stats card, so the roast can mock (or praise) impact
relative to field, not just raw counts.

## Scope

Extend only the OpenAlex `/retrieve` path, its assembled text, and its structured
stats. Do not add a new source.

## Required reading

`docs-dev/reference/primary_authoritative/specification.md`: Domain rules (Later
data sources — OpenAlex; Source inputs and validation), Architecture (The Worker),
Roast output presentation (the stats card).

## Dependencies

`010_openalex` (author + works retrieval) and `016_metrics` (the metrics block and
stats entries this extends).

## Required changes

1. In the OpenAlex works fetch, include the fields needed for field normalisation —
   prefer OpenAlex's native per-work `fwci` if present; otherwise approximate from
   `cited_by_percentile_year` (mean percentile / 50, where 1.0 ≈ world average).
   Verify the exact field availability against the live API at build.
2. Read `primary_location.source.summary_stats.2yr_mean_citedness` across the top
   works to derive a mean journal-citedness (an impact-factor proxy).
3. Append both as labelled, factual lines to the retrieved text and add them to the
   structured `stats` object (e.g. `FWCI`, `Mean journal citedness`). Omit cleanly
   when the inputs are absent.

## Do not implement

Do not implement:
- the p-index (that is `022_openalex_pindex`);
- any new source or any keyed/paid API;
- charts or any visualisation.

## Acceptance criteria

The task is complete when:
- OpenAlex retrieval text and the stats card include an FWCI and a mean
  journal-citedness when available, and omit them cleanly otherwise;
- the figures are derived correctly (verified against a small hand check);
- the build and Worker dry-run pass.

## Automated checks

```bash
npm run check
cd worker && npx wrangler deploy --dry-run
```

## Manual verification

Retrieve a well-known OpenAlex author and confirm the FWCI and journal-citedness
lines are present and plausible; confirm a sparse author omits them.

## Commit and push

If and only if the scope was followed and checks pass, create one commit on
`main` using this file's exact filename (`021_openalex_field_metrics.md`) as the
commit message, then push.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required five-section final report specified in `AGENTS.md`.
