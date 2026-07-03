# Task: Reverse-chronological papers + multi-match name foldout

## Goal

Two refinements to the Step 01 / Step 02 input flow, following the site-theme
refresh (`055`):

1. The overview **papers** list should read **newest first** (reverse chronological),
   not oldest first.
2. Restore the **"see more matches" foldout** for a name search: when a source
   returns more than one candidate, the user must still be able to view the similar
   names and pick the right one — adapted to the new single-line rows.

## Required changes

`src/ui.ts`:
- **Reverse-chronological papers** — in `renderOverview`, sort the papers foldout by
  year **descending** (undated papers sink to the end). Personalia "Education" stays
  ascending (oldest first).
- **Match foldout** — when `doSearch` finds several candidates for a source, keep the
  full ranked list and, besides auto-filling the best match, render a `renderMatchFoldout`
  beneath that row (spanning its full width). The collapsed summary names the chosen
  candidate + count; expanding lists every candidate (name + affiliation) as a pickable
  button that fills the field with its id and re-ticks the row. A single candidate shows
  no foldout. The foldout is removed when the field is edited manually or a new search
  resets the inputs.

`src/style.css`: `.inopt__more` (grid-column 1/-1), `.inopt__more-summary` (caret,
mono), `.inopt__cands` / `.inopt__cand` (name + affiliation, selected state) — cosmic
theme, matching the row aesthetic.

## Acceptance criteria

- `npm run check` passes.
- Overview papers are newest-first; a multi-candidate search shows a per-row foldout
  whose entries switch the filled id; a single-candidate search shows none.

## Commit and push

Commit using this file's exact filename, then push.
