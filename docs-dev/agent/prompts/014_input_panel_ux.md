# Task: Rework the input panel UX

## Goal

Replace the input panel with a cleaner, conventional layout: a drag-and-drop
dropzone with a styled "Choose files" button and file chips (tick/cross), a tidy
text area, and a segmented intensity control.

## Scope

Implement only the front-end input UI. Do not change extraction, the Worker, the
roast flow, or retrieval.

## Required reading

`docs-dev/reference/primary_authoritative/specification.md`: Domain rules (Input
handling; Source inputs and validation), UI and platform requirements.

## Dependencies

`006_input_files` and `013_upload_list` (client-side extraction + multi-file).

## Required changes

1. Replace the bare `<input type="file">` + separate Upload button with a
   drag-and-drop dropzone containing a styled "Choose files" button (hidden native
   input). Process files on drop/select (no separate Upload click); show each file
   as a chip/row with a tick (text extracted) or a cross + reason, and a remove
   control.
2. Tidy the panel: text area with a clear label and the character counter;
   intensity as a segmented toggle (still `mild`/`medium`/`spicy`, default
   `spicy`); a prominent Roast button. Keep the helper lines and privacy notice.
3. Responsive and accessible: keyboard operable, proper labels, adequate
   contrast. British English.

## Do not implement

Do not implement:
- changes to extraction (`006`), the Worker, sharing, or retrieval;
- new dependencies unless trivial and justified.

## Acceptance criteria

The task is complete when:
- the file control is a conventional dropzone + "Choose files" button (no raw
  native file input on show), files appear as chips with status and can be
  removed;
- intensity is a segmented control defaulting to `spicy`;
- the panel reads and behaves like a normal modern web form, on mobile and
  desktop.

## Automated checks

```bash
npm run check
bash scripts/check-public-build.sh dist
```

## Manual verification

On the live site, drag files in and use "Choose files"; confirm chips with
tick/cross, remove one, pick an intensity, and roast.

## Commit and push

If and only if the scope was followed and checks pass, create one commit on
`main` using this file's exact filename (`014_input_panel_ux.md`) as the commit
message, then push.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required five-section final report specified in `AGENTS.md`.
