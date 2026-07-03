# Task: Search-and-retrieve input flow

## Goal

Reshape the Input step into an explicit, guided flow: search a name across the
three name-searchable sources, choose from clearly numbered input options,
retrieve the data as a discrete step with a compact overview of what was found,
and only then reveal the roast. Behaviour of the roast pipeline itself is
preserved; the change is to the input surface and the order of the funnel.

## Required changes

`src/ui.ts`:
- **Search by name** — search ORCID, OpenAlex and GitHub only (drop Semantic
  Scholar and DBLP from the by-name search). Group results per source. For each
  source show the single most-similar match at the top; when a source returns
  more than one candidate, hide the rest behind a per-source "see more options"
  foldout. Selecting an option (top or from the foldout) fills that source's
  numbered field, moves the chosen name to the top and folds the options back in.
- **Numbered input options** — a clearly numbered, centrally-presented list:
  1. ORCID, 2. OpenAlex, 3. GitHub (each a field, auto-filled by a search pick
  or entered directly), 4. Upload documents (e.g., CV) — the upload/paste area,
  5. Enter URL link (e.g., website).
- **Retrieve data** — a discrete button that retrieves every provided input,
  de-duplicating an OpenAlex record already covered by an ORCID one, then renders
  a **compact overview**: papers found via ORCID/OpenAlex, projects via GitHub,
  documents scanned and links scanned, with per-source ✓/✗ status.
- **Roast me** — the roast settings (intensity, format) and the "Roast me" button
  are revealed only after a retrieval. The roast consumes the already-retrieved
  data; changing any input marks it stale so the next roast re-retrieves.
- Keep the sample roast, ORCID login auto-load, papers re-roast, share and
  "Download the retrieved data" export working against the new inputs.

`src/style.css`: styles for the numbered option list, per-source search groups,
the retrieve button row and the compact overview. Cosmic theme, British English.

## Follow-up refinements

From review of the first cut:
- **One list, not two.** After a name search, do not show a separate results block
  above the numbered options. The matches fold **into** the five-option list: each
  source's closest match populates its own numbered option, shown as the researcher's
  **name** (not the raw ORCID/OpenAlex ID), with the "see more options" foldout and a
  "enter a different ID manually" toggle inline in that option.
- **A checkbox before each of the five options**, showing a clearly visible green
  check when selected. A match or a manually-typed value ticks it automatically; only
  ticked options are retrieved, so a mis-matched source can be excluded.
- **Option 4 is upload-only** — an upload button (and drop target), no paste-text box.

## Acceptance criteria

- `npm run check` passes.
- Search → pick → retrieve → overview → roast works end to end; the roast still
  streams and renders personalia, papers, stats and charts as before.

## Commit and push

Commit using this file's exact filename, then push.
