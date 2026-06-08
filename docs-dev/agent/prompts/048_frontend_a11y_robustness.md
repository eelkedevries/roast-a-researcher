# Task: Front-end accessibility and robustness fixes

## Goal

Fix verified accessibility gaps and reliability bugs in the front end. No visual
redesign; behaviour-preserving except where it removes a defect.

## Required changes

`src/ui.ts`:
- Accessible names: `aria-label` on the search-by-name input, the profile textarea,
  the link-row and website-row URL inputs, and each search-result checkbox
  (`Select <name>`); `aria-live="polite"` on `#search-results`.
- Abortable roast: a module-level `AbortController`; pass its `signal` to the roast
  fetch; abort it at the top of `runSearch`/`showDemo` so a stale stream can't
  overwrite the reset UI; release the SSE reader in a `finally`
  (`reader.cancel()`); ignore `AbortError` in the catch.
- Screen-reader: set `aria-busy` on `#output` during streaming and clear it on every
  exit path (announces the finished roast once, not per token).
- Remove the unreachable ternary branch in `recordUrl`'s `website` case.

`src/sources.ts`: add `AbortSignal.timeout(12000)` to the `/search` fetch (a hung
source no longer freezes the spinner). Leave `/retrieve` untimed (legitimately slow).

`src/extract.ts`: destroy the pdf.js loading task in a `finally` in both `extractPdf`
and `ocrPdf`; in `ocrPdf` create one Tesseract worker for the whole document
(`createWorker('eng')` + `worker.recognize`) instead of re-initialising per page.

`src/charts.ts`: coerce the SVG bar value with `Number(it.value)` (escaping symmetry
with the label).

## Acceptance criteria

- `npm run check` passes.
- No layout/behaviour regression; the roast still streams and renders identically.

## Commit and push

Commit using this file's exact filename, then push.
