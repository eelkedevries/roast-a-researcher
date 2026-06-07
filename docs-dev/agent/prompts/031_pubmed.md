# Task: PubMed / NCBI (biomedical, name-matched)

## Goal

Add PubMed (via NCBI E-utilities) as a keyless source of a researcher's biomedical
articles (title, journal, year) for roast material, anchored on an ORCID where
available and otherwise name-matched.

## Scope

Add a Worker `/retrieve` case for `pubmed` and a search entry, plus front-end wiring.

## Required reading

`docs-dev/reference/primary_authoritative/specification.md`: Domain rules (Source
inputs and validation — **identity anchored on a stable identifier**; Privacy and
reputational handling), Architecture.

## Dependencies

`012` (input panel / search) and `030_arxiv` (the name-matched-source spec
provision). Prefer ORCID-anchored queries (`<orcid>[auid]`) when an ORCID is
present; fall back to name (`<name>[au]`) with the same name-matched safeguards and
labelling. Update the spec and bump the version when run.

## Required changes

1. Worker `/retrieve` (`source: pubmed`): `esearch.fcgi?db=pubmed&term=…&retmode=json`
   (term = `<orcid>[auid]` when anchored, else `<name>[au]`) to get PMIDs, then
   `esummary.fcgi?db=pubmed&id=…&retmode=json&version=2.0` for titles, journals,
   years; assemble a bounded list into text. Keyless (an API key only raises the
   rate); degrade visibly on error.
2. Search: surface a single synthetic candidate (`PubMed: articles matching "<name>"`)
   for explicit selection; label name-matched unless ORCID-anchored.
3. Front end: add `pubmed` to the source kinds and labels; carry the term as the id;
   show the name-matched caveat when not ORCID-anchored.

## Do not implement

Do not implement:
- treating a name match as verified identity or silent merge;
- MeSH/abstract-heavy payloads beyond a bounded summary; charts; storing data.

## Acceptance criteria

The task is complete when a PubMed query returns recent articles into the roast
(ORCID-anchored when possible, else clearly name-matched), the spec covers it with
safeguards and its version is bumped, and `npm run check` + the Worker dry-run pass.

## Automated checks

```bash
npm run check
cd worker && npx wrangler deploy --dry-run
```

## Manual verification

Query a biomedical author (with and without ORCID) and confirm a plausible article
list with the correct anchoring/label.

## Commit and push

If and only if the scope was followed and checks pass, create one commit on `main`
using this file's exact filename (`031_pubmed.md`) as the commit message, then push.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required five-section final report specified in `AGENTS.md`.
