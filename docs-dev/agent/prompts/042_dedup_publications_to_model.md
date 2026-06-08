# Task: Feed the model a de-duplicated publications list (kill citation-count comparisons)

## Goal

The model keeps comparing citation counts between a preprint and its journal
version — e.g. "cited 35 times. Or 13 times. Or potentially both, depending on
which version … you're looking at." Prompt rules alone (008c5f53/040/041) have not
stopped it because the model is fed the raw per-source narrative: OpenAlex emits
`- "title" — cited 35` and Semantic Scholar emits `- "title" — cited 13` for the
same work, so two conflicting counts are visible. The merged/de-duplicated paper
list (`mergePapers`) is only used for display, never sent to the model. Fix it at
the source: hand the model one authoritative, de-duplicated publications list and
tell it those are the only counts that matter.

## Scope

Front end (`src/ui.ts`): make `mergePapers` also collapse near-identical titles
(token containment, conservative), build an authoritative publications block, and
append it to the profile sent to the worker. Worker (`worker/src/index.ts`): a
system-prompt rule that the block is the single source of truth and the narrative's
duplicate counts must never be compared. Spec note + version bump.

## Required reading

`docs-dev/reference/primary_authoritative/specification.md`: Roast generation
(Versions of one work); Roast output presentation (Papers de-dup).

## Required changes

1. `src/ui.ts`:
   - Replace `mergePapers` with a version that keeps the DOI / exact-normalised-
     title fast path and additionally collapses near-identical titles by token
     containment (proportion of the smaller token set found in the larger ≥ 0.9,
     smaller set ≥ 4 tokens, after lowercasing/diacritic/punctuation stripping and
     dropping a small stopword set). Keep the highest citation count, fill missing
     venue/year, prefer the fullest title. (This also de-duplicates the displayed
     Papers card.)
   - Add `publicationsBlock(papers)` rendering the merged list (capped) under a
     header `PUBLICATIONS (authoritative, de-duplicated across all sources …)`.
   - In `runRoast`, compute the merged papers once, append the block to `profile`
     (before the length check), and reuse the merged list for `renderPapers`.
2. `worker/src/index.ts`, `buildSystemPrompt`: add a content-floor rule that when a
   `PUBLICATIONS (authoritative, de-duplicated …)` section is present it is the
   single source of truth for distinct works and citation counts; the narrative may
   list the same work several times (versions / multiple sources) with different
   counts; never compare/contrast counts, never present two counts for one paper,
   never read a count as evidence of republishing; use each work once.
3. `specification.md`: note the authoritative de-duplicated publications list fed to
   the model under Versions of one work. Bump the version.

## Do not implement

- removing the per-source narrative paper lists (they carry abstracts/TL;DRs);
- a second model call or verification pass;
- aggressive fuzzy matching that risks merging genuinely distinct papers.

## Acceptance criteria

- `npm run check` passes and `wrangler deploy --dry-run` succeeds.
- The profile sent to the model includes a single de-duplicated publications list;
  the system prompt makes it authoritative and bans cross-version count
  comparisons; the displayed Papers card no longer shows near-duplicate entries;
  the spec records it and its version is bumped.

## Automated checks

```bash
npm run check
cd worker && npx wrangler deploy --dry-run
```

## Manual verification

After deploy: roast a profile (e.g. ORCID + OpenAlex + Semantic Scholar) whose work
has a preprint and a journal version with different citation counts; confirm the
roast cites one count and makes no "35 or 13 or both" comparison, and the Papers
card lists the work once.

## Commit and push

Commit using this file's exact filename (`042_dedup_publications_to_model.md`),
then push.

## Final report

End with the required five-section final report specified in `AGENTS.md`.
