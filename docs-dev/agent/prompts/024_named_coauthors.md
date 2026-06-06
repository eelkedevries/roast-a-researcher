# Task: Named frequent co-authors

## Goal

Surface a researcher's most frequent named co-authors (with affiliation/country
where available) from OpenAlex, folding a compact list into the roast input so the
roast can mock the usual-suspects collaboration cluster, going beyond the
country/continent counts of `019`.

## Scope

Extend only the OpenAlex `/retrieve` path and its assembled text. Add no new
source and no visualisation.

## Required reading

`docs-dev/reference/primary_authoritative/specification.md`: Domain rules (Later
data sources — OpenAlex; Source inputs and validation; Privacy and reputational
handling; Roast content, register, and safety), Architecture (The Worker).

## Dependencies

`010_openalex` (works with authorships) and `019_openalex_enrichment` (the
geography summary this complements).

## Required changes

1. Worker (OpenAlex path): from the author's works' `authorships`, tally co-authors
   by OpenAlex author id (excluding the subject), and take the top few by shared
   paper count, with each co-author's display name and, where available,
   institution/country.
2. Append a compact, labelled `Frequent co-authors:` block to the retrieved text
   (e.g. `- Name (Institution) — N shared papers`); omit cleanly when authorships
   are absent.
3. Keep it bounded (reuse the works already fetched; cap the list, e.g. top 5–8)
   and factual — names only as reported by OpenAlex, no invented relationships.

## Do not implement

Do not implement:
- a co-author network graph or any visualisation;
- a new source or any keyed/paid API;
- storing fetched data.

## Acceptance criteria

The task is complete when:
- OpenAlex retrieval text includes a bounded list of named frequent co-authors with
  shared-paper counts when authorships exist, and omits the block cleanly
  otherwise;
- the subject author is excluded and counts are correct on a small hand check;
- the build and Worker dry-run pass.

## Automated checks

```bash
npm run check
cd worker && npx wrangler deploy --dry-run
```

## Manual verification

Retrieve a collaborative author and confirm the co-author list is plausible, named,
and excludes the subject; confirm a solo/thin author omits the block.

## Commit and push

If and only if the scope was followed and checks pass, create one commit on
`main` using this file's exact filename (`024_named_coauthors.md`) as the commit
message, then push.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required five-section final report specified in `AGENTS.md`.
