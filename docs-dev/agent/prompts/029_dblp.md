# Task: DBLP source (computer science)

## Goal

Add DBLP — the computer-science bibliography — as a keyless search + retrieval
source: search authors by name, and retrieve a chosen author's publications
(titles, venues, years) as roast input, anchored on the DBLP person id (pid).

## Scope

Add Worker `/search` and `/retrieve` cases for `dblp` and wire the source into the
front-end picker. No new charts.

## Required reading

`docs-dev/reference/primary_authoritative/specification.md`: Domain rules (Source
inputs and validation — identity anchored on a stable identifier; Later data
sources), Architecture (The Worker).

## Dependencies

`011_github` / `012` (the `/search` + `/retrieve` contracts). Update the spec's
"Later data sources" and bump the version when run (DBLP is a new source).

## Required changes

1. Worker `/search` (`source: dblp`): call
   `https://dblp.org/search/author/api?q=…&format=json`, parse `result.hits.hit[].info`
   (`author`, `url`), derive the pid (the path after `pid/`), and return up to 5
   candidates `{ id: pid, name, affiliation? }` (affiliation often absent in DBLP).
2. Worker `/retrieve` (`source: dblp`): fetch the author's publications (e.g. the
   person record `https://dblp.org/pid/{pid}.xml`, or the publ search API in JSON),
   and assemble a bounded list of recent/representative works (title, venue, year)
   into text. Verify the exact pid→publications mechanism and format at build.
3. Front end: add `dblp` to the source kinds, search list, and labels; detect
   `dblp.org/pid/...` URLs. Candidates feed retrieval as today.

## Do not implement

Do not implement:
- citation metrics (DBLP has none) or charts;
- a new identifier source beyond DBLP; storing fetched data.

## Acceptance criteria

The task is complete when a name search returns DBLP author candidates, selecting
one retrieves its publication list into the roast, the pid anchors identity, and
`npm run check` + the Worker dry-run pass.

## Automated checks

```bash
npm run check
cd worker && npx wrangler deploy --dry-run
```

## Manual verification

Search a CS researcher, pick the DBLP result, and confirm a plausible publication
list appears.

## Commit and push

If and only if the scope was followed and checks pass, create one commit on `main`
using this file's exact filename (`029_dblp.md`) as the commit message, then push.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required five-section final report specified in `AGENTS.md`.
