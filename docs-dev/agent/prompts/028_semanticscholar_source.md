# Task: Semantic Scholar as a search + retrieval source

## Goal

Make Semantic Scholar a first-class source (not just DOI enrichment): search authors
by name, and retrieve a chosen author's profile (paper count, h-index, total
citations) and top papers (title, year, citations, TLDR) as roast input and stats.

## Scope

Add Worker `/search` and `/retrieve` cases for `semanticscholar`, and wire the
source into the front-end picker. Keep DOI-level enrichment (`023`) as-is.

## Required reading

`docs-dev/reference/primary_authoritative/specification.md`: Domain rules (Source
inputs and validation; Later data sources), Architecture (The Worker), Roast output
presentation (stats card).

## Dependencies

`011_github` / `012` (the `/search` + `/retrieve` contracts) and `023_semantic_scholar`
(the existing keyless S2 client). Update the spec's "Later data sources" and bump
the version when run (S2 becomes a searchable source).

## Required changes

1. Worker `/search` (`source: semanticscholar`): call
   `https://api.semanticscholar.org/graph/v1/author/search?query=…&fields=name,affiliations,paperCount,citationCount,hIndex`
   (keyless; handle 429 + Retry-After by degrading), return up to 5 candidates
   `{ id: authorId, name, affiliation }`.
2. Worker `/retrieve` (`source: semanticscholar`): call
   `/graph/v1/author/{id}?fields=name,affiliations,paperCount,citationCount,hIndex,papers.title,papers.year,papers.citationCount,papers.tldr`,
   assemble text and a `stats` block (Papers, Citations, h-index); include the top
   papers (most-cited) with TLDRs.
3. Front end: add `semanticscholar` to the source kinds, search list, and labels;
   detect `semanticscholar.org/author/...` URLs. Candidates feed retrieval as today.

## Do not implement

Do not implement:
- a paid S2 key tier (keyless only);
- charts for S2 (OpenAlex remains the charts source);
- storing fetched data.

## Acceptance criteria

The task is complete when a name search returns S2 author candidates, selecting one
retrieves its metrics + top papers into the roast and stats card, failures degrade
visibly, and `npm run check` + the Worker dry-run pass.

## Automated checks

```bash
npm run check
cd worker && npx wrangler deploy --dry-run
```

## Manual verification

Search a known researcher, pick the Semantic Scholar result, and confirm metrics +
papers appear; confirm a 429 shows a clear note rather than failing silently.

## Commit and push

If and only if the scope was followed and checks pass, create one commit on `main`
using this file's exact filename (`028_semanticscholar_source.md`) as the commit
message, then push.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required five-section final report specified in `AGENTS.md`.
