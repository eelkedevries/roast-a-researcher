# Task: Charts and plots in the front end

## Goal

Render the retrieved chart data as simple client-side graphs below the roast —
citations and publications per year, the open-access breakdown, and top co-author
countries — so a roast comes with a visual snapshot of the record.

## Scope

Front-end rendering only, from the `charts` data returned by `025_chart_data`. This
introduces visualisation to the project: update the specification and bump its
version (see Required reading).

## Required reading

`docs-dev/reference/primary_authoritative/specification.md`: Roast output
presentation (the personalia box and stats card), Sharing and export, Architecture
(Two deployables — the front end holds no secret), Locked decisions. **Scope
change:** earlier work excluded visualisation; this prompt adds it. Update "Roast
output presentation" (and, if relevant, Scope) to include charts, and bump the
spec version, before or as part of this change.

## Dependencies

`025_chart_data` (the structured series) and `012_source_input_panel` / the
existing `runRoast` flow and stats card.

## Required changes

1. Add a small charts module that renders inline **SVG** (no secret, no network),
   keeping the dependency-light, fully-owned ethos; a tiny charting library is
   acceptable only if clearly justified over hand-rolled SVG.
2. Render, below the roast (near the stats card): a per-year bar/line for citations
   and publications, an open-access breakdown (bar or donut), and a top-countries
   bar. Reveal the charts only when their series exist; hide otherwise.
3. Keep it accessible: each chart has a title and a text/data-table fallback so the
   numbers are available without the visual. Match the existing dark styling.

## Do not implement

Do not implement:
- a world-map or co-author network graph (out of scope for now);
- charts inside the downloadable PNG export;
- any new data source or Worker change; storing data.

## Acceptance criteria

The task is complete when:
- after roasting an OpenAlex profile, the page shows per-year, open-access, and
  country charts driven by the `025` data, hidden when data is absent;
- each chart has an accessible title and a data fallback;
- the specification reflects the new visualisation scope and its version is bumped;
- the build passes.

## Automated checks

```bash
npm run check
```

## Manual verification

Roast an OpenAlex profile and confirm the charts render correctly and match the
stats; roast pasted-only text and confirm no empty chart area appears.

## Commit and push

If and only if the scope was followed and checks pass, create one commit on
`main` using this file's exact filename (`027_charts.md`) as the commit message,
then push.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required five-section final report specified in `AGENTS.md`.
