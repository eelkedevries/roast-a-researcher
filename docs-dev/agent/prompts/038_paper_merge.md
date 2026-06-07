# Task: Cross-platform paper merge with de-duplication

## Goal

Collect papers from every retrieved structured source (ORCID, OpenAlex, Semantic
Scholar, DBLP), combine them, and remove duplicates, then render the merged list
in the Papers section — instead of relying on the model's per-source extraction.

## Scope

Each structured retrieval returns a `papers[]` array; the front end merges and
de-duplicates them (by DOI, else normalised title) and renders the result. The
model-extracted `papers` remains a fallback for pasted text / websites.

## Required reading

`docs-dev/reference/primary_authoritative/specification.md`: Roast output
presentation, Later data sources. Retrieval goes through the Worker.

## Required changes

1. Worker: a shared `ApiPaper` shape `{ title, year, venue, citations, doi }` and a
   DOI normaliser. Each retrieval adds `papers` to its JSON response:
   - **OpenAlex** (`buildOpenalex`): a ~50-work fetch (title, year, venue,
     citations, doi) → `papers`; included in `OpenAlexResult`.
   - **ORCID**: work-summaries → title + year + DOI (from external-ids); combined
     with the auto-resolved OpenAlex `papers`.
   - **Semantic Scholar**: author papers (+ `externalIds`, `venue`) → `papers`.
   - **DBLP**: publications (title, year, venue, DOI from `<ee>`) → `papers`.
2. `src/sources.ts`: `ApiPaper` type; `papers?` on `RetrieveResult`; parse it.
3. `src/ui.ts`: collect `papers` across links in `validateLinks`; a `mergePapers`
   that de-dupes (DOI → normalised title), keeps the max citation count, fills
   missing venue/year, sorts by citations then year; render the merged list in the
   Papers section (capped), overriding model papers when any structured papers exist.
4. Spec: note the cross-source merge/de-dupe in Roast output presentation; bump.

## Do not implement

- fetching a researcher's entire corpus (cap per source ~50–100, by citations/recency);
- model-side de-duplication.

## Acceptance criteria

- `npm run check` passes and `wrangler deploy --dry-run` succeeds.
- Selecting ORCID + OpenAlex (+ others) yields one combined, de-duplicated paper
  list; pasted-only input still falls back to model papers.

## Automated checks

```bash
npm run check
cd worker && npx wrangler deploy --dry-run
```

## Manual verification

After deploy: roast a researcher with several sources and confirm the Papers list
is combined and free of obvious duplicates.

## Commit and push

Commit using this file's exact filename (`038_paper_merge.md`), then push.

## Final report

End with the required five-section final report specified in `AGENTS.md`.
