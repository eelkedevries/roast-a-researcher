# Task: Citation metrics from retrieved works

## Goal

Compute citation metrics (total, h-index, g-index, i10, h5, mean citations) from a
retrieved publication list and fold a compact, factual metrics summary into the
roast input, giving the model concrete numbers to roast.

## Scope

Implement only metrics computation over already-retrieved works and its inclusion
in the retrieved text. Do not add a new external source or any visualisation.

## Required reading

`docs-dev/reference/primary_authoritative/specification.md`: Domain rules (Source
inputs and validation; Roast content, register, and safety), Architecture (The
Worker).

## Dependencies

`010_openalex` (OpenAlex works carry per-paper citations + year). Note `011_github`
does not provide citation metrics, so this is meaningful only for sources that
return a publication list with citation counts.

## Required changes

1. Add a small metrics module (Worker-side, e.g. `worker/src/metrics.ts`) with
   pure functions over an array of `{ citations, year }`: total citations,
   h-index, g-index, i10-index, h5-index (last 5 years), and mean citations per
   paper.
2. In the OpenAlex retrieval path, compute these from the author's works and
   append a compact, labelled block to the retrieved text (e.g. `Metrics —
   citations: …; h-index: …; g-index: …; i10: …; mean/paper: …`).
3. Keep every number factual: omit a metric when its inputs are absent rather
   than guessing.

## Do not implement

Do not implement:
- new external sources;
- field-normalized/FWCI or p-index (separate work);
- charts or any visualisation;
- storing anything.

## Acceptance criteria

The task is complete when:
- given OpenAlex works, the retrieved text includes correct h/g/i10/total
  (verified against a hand calculation on a small case);
- metrics are omitted cleanly when no per-paper data is present;
- the build and Worker dry-run pass.

## Automated checks

```bash
npm run check
cd worker && npx wrangler deploy --dry-run
```

## Manual verification

Retrieve an OpenAlex author and confirm the metrics block matches a hand
calculation for a small, known case.

## Commit and push

If and only if the scope was followed and checks pass, create one commit on
`main` using this file's exact filename (`016_metrics.md`) as the commit message,
then push.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required five-section final report specified in `AGENTS.md`.
