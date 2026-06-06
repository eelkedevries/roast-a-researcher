# Task: OpenAlex enrichment — open-access stats and co-author geography

## Goal

Enrich the roast input with an OpenAlex open-access breakdown (gold/green/hybrid/
bronze/closed) and a co-author geography summary (countries/continents), beyond
the basic retrieval in `010`.

## Scope

Implement only the extra OpenAlex enrichment and its inclusion in the retrieved
text. Do not add visualisations or new sources.

## Required reading

`docs-dev/reference/primary_authoritative/specification.md`: Domain rules (Later
data sources — OpenAlex; Source inputs and validation), Architecture.

## Dependencies

`010_openalex` (author match + works + the OpenAlex key).

## Required changes

1. Worker (OpenAlex path): fetch OA status via `group_by=open_access.oa_status`
   and summarise gold/green/hybrid/bronze/closed plus an OA percentage.
2. Fetch co-author institutions and map them to countries/continents; summarise
   the spread (e.g. "co-authors across N countries on M continents").
3. Append both as labelled lines to the retrieved text; omit cleanly when the data
   is missing.

## Do not implement

Do not implement:
- a world-map visualisation or per-paper OA badges/UI;
- new external sources;
- storing the fetched data.

## Acceptance criteria

The task is complete when:
- OpenAlex retrieval text includes an OA breakdown and a geography summary when
  available, and omits them cleanly otherwise;
- the build and Worker dry-run pass.

## Automated checks

```bash
npm run check
cd worker && npx wrangler deploy --dry-run
```

## Manual verification

Retrieve a well-known OpenAlex author and confirm the OA and geography lines are
present and plausible.

## Commit and push

If and only if the scope was followed and checks pass, create one commit on
`main` using this file's exact filename (`019_openalex_enrichment.md`) as the
commit message, then push.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required five-section final report specified in `AGENTS.md`.
