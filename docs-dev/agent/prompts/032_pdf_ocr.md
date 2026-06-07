# Task: OCR fallback for scanned PDFs

## Goal

When an uploaded PDF has no text layer (a scanned/image-only PDF), offer an opt-in
client-side OCR fallback so the user can still extract text — without uploading the
file anywhere.

## Scope

Front-end only: an OCR path in `src/extract.ts` and an opt-in trigger in the file
list. No Worker change, no automatic OCR.

## Required reading

`docs-dev/reference/primary_authoritative/specification.md`: Domain rules (Input
handling — client-side extraction; the graceful-degradation rule for unsupported
files), Architecture (the front end performs all file-to-text extraction; the
Worker contract is text-only), Privacy and reputational handling.

## Dependencies

`006_input_files` (the existing client-side extraction) and `013_upload_list`
(the per-file list with status/reason).

## Required changes

1. Add a distinct error for image-only PDFs (e.g. `ScannedPdfError extends
   UnsupportedFileError`) thrown by `extractPdf` when no text layer is found.
2. Add `ocrPdf(file, onProgress?)` to `src/extract.ts`: lazy-load `tesseract.js`
   and (reusing pdf.js) render each page to a canvas, OCR it, and join the text.
   Cap the number of pages (e.g. 10) to bound time/memory on mobile; report
   progress via the callback; free each canvas after use.
3. File list: when a PDF fails with `ScannedPdfError`, show a "Try OCR (scanned
   PDF)" button on that row instead of only the paste message. On click, run
   `ocrPdf` with a progress indicator, then merge the text into the editable input
   and mark the row ✓ (or show a clear message if OCR finds nothing).
4. Keep OCR opt-in and lazy: the engine and language data download only when the
   user clicks. Note in code/comments that OCR assets load from the tesseract.js
   CDN on demand.

## Do not implement

Do not implement:
- automatic OCR on every PDF, or OCR on the normal text-layer path;
- a Worker/cloud OCR call (must stay client-side; the file never leaves the browser);
- languages beyond English unless trivially configurable; storing anything.

## Acceptance criteria

The task is complete when a text-layer PDF still extracts as before; a scanned PDF
shows a "Try OCR" button that, on click, lazily OCRs (with progress) and fills the
input; OCR finding nothing shows a clear message; and `npm run check` passes.

## Automated checks

```bash
npm run check
```

## Manual verification

Upload a born-digital PDF (extracts directly) and a scanned/image-only PDF (shows
"Try OCR"; clicking produces text after a short download + processing).

## Commit and push

If and only if the scope was followed and checks pass, create one commit on `main`
using this file's exact filename (`032_pdf_ocr.md`) as the commit message, then push.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required five-section final report specified in `AGENTS.md`.
