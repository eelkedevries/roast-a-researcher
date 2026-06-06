# Task: Multi-file upload list with per-file validation

## Goal

Extend file upload to accept one or many files and show each filename in a list
with a tick (text extracted) or a cross plus a brief reason, merging the valid
files' text into the editable roast input.

## Scope

Implement only the multi-file upload UI and its per-file status, building on the
existing client-side extraction. Extraction stays client-side; the Worker
contract is unchanged.

## Required reading

`docs-dev/reference/primary_authoritative/specification.md`: Domain rules (Source
inputs and validation; Input handling), Architecture (the front end does all
file-to-text extraction).

## Dependencies

`006_input_files` (client-side extraction in `src/extract.ts`).

## Required changes

1. Allow selecting multiple files (`multiple`) and add an explicit Upload button.
   On Upload (and on multi-file drag-drop), process each selected file.
2. List each filename beneath the input with a tick when text was extracted, or a
   cross plus a brief reason (unsupported type, image-only PDF, empty/unreadable)
   in small print.
3. Merge the text of all successful files into the editable roast input (clearly
   separated), leaving it editable for review.

## Do not implement

Do not implement:
- sending files to the Worker (extraction stays client-side);
- OCR or `.doc` binary support;
- the identifier/URL panel (`012`).

## Acceptance criteria

The task is complete when:
- multiple files can be uploaded and each appears in the list with a tick or a
  cross plus a reason;
- text from the successful files is merged into the editable roast input;
- the bundle stays under the 5 MB budget.

## Automated checks

```bash
npm run check
bash scripts/check-public-build.sh dist
```

## Manual verification

Upload several files at once (a mix of supported and unsupported); confirm the
per-file ticks/crosses with reasons and that the supported files' text is merged
into the field.

## Commit and push

If and only if the scope was followed and checks pass, create one commit on
`main` using this file's exact filename (`013_upload_list.md`) as the commit
message, then push.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required five-section final report specified in `AGENTS.md`.
