# Task: Client-side file upload and text extraction

## Goal

Let users upload `.txt`, `.md`, `.pdf`, `.docx`, and `.odt` files that the
browser converts to text into the editable paste field, with graceful fallback
for unsupported files.

## Scope

Implement only client-side file-to-text extraction feeding the existing paste
field. The Worker contract stays text-only and unchanged.

## Required reading

`docs-dev/reference/primary_authoritative/specification.md`: Domain rules (Input
handling), Architecture (the front end does all file-to-text extraction;
performance budgets; Repository layout — `src/extract.ts`).

## Dependencies

`002_frontend_shell` (the editable paste field exists).

## Required changes

1. Add `src/extract.ts`: file-picker and drag-drop handling that converts an
   upload to text and places the result into the editable paste field for the
   user to review and amend before roasting. Extract `.txt`/`.md` directly;
   `.pdf` via a client-side PDF text extractor; `.docx` via a client-side
   DOCX-to-text library; `.odt` by unzipping and reading `content.xml` in the
   browser.
2. Graceful degradation: legacy binary `.doc` and scanned/image-only PDFs are
   unsupported — show guidance to save as PDF/`.docx` or paste the text, never a
   hard failure.
3. Stay within the bundle budget (under 5 MB); load heavy parsers lazily where
   practical.

## Do not implement

Do not implement:
- server-side parsing or sending files to the Worker (the contract is text only);
- OCR for image-only PDFs, or `.doc` binary support;
- sharing/export, rate limiting, or data sources.

## Acceptance criteria

The task is complete when:
- each supported format's text is extracted client-side, lands editable in the
  paste field, and is roastable;
- an unsupported file shows the fallback guidance without crashing;
- the bundle stays under budget.

## Automated checks

```bash
npm run check
```

## Manual verification

Upload one file of each supported format and confirm the extracted text appears
in the paste field; upload a `.doc` or image-only PDF and confirm the guidance
shows.

## Commit and push

If and only if the scope was followed and checks pass, create one commit on
`main` using this file's exact filename (`006_input_files.md`) as the commit
message, then push.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required five-section final report specified in `AGENTS.md`.
