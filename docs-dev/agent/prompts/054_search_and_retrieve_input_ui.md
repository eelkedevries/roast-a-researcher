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
- **Deselectable papers and projects.** In the overview, the "papers" and "projects"
  counts are fold-out checklists: each paper (from the merged list) and each GitHub
  repository is one entry with a checkbox, ticked by default. Deselecting an entry
  drops it from the roast — papers via the de-duplicated publications block **and** the
  trusted `exclude` list; repositories by removing their line from the GitHub block.
  Exclusions are applied when the profile is assembled at roast time, so toggling a
  box needs no re-fetch, and they persist across re-roasts (cleared on a new search).
- **Compact papers, no per-source list.** Each paper entry is two lines — the title,
  then an abbreviated venue · year · citations (ISO-4-ish word abbreviations; a
  trailing acronym in parentheses is preferred, e.g. "… (DANS)" → "DANS"). The
  per-source ✓ status list and the "Looks right?" hint are dropped (they duplicated
  the counts and showed a raw per-source paper total that disagreed with the
  de-duplicated headline); only retrieval **failures** are surfaced.
- **Three numbered steps.** The form is split into **01 Add your data** (search +
  options + Retrieve), **02 Confirm your data** (the overview), and **03 Roast your
  data** (settings). Steps 02 and 03 are revealed only after a retrieval.
- **URL "Add" button.** Option 5 gets an **Add** button beside the field that
  retrieves the URL immediately and shows ✓ Added / ✗ Failed (with the reason)
  inline, so a website can be confirmed before roasting.
- **PDF upload fix.** The pdf.js worker is bundled through Vite (`?worker`,
  `worker: { format: 'es' }`) so it ships as a hashed `.js` chunk. The previous raw
  `pdf.worker.min.mjs` was served with a non-JS MIME type by the static host, which
  silently broke the module worker and failed every PDF upload.

## Acceptance criteria

- `npm run check` passes.
- Search → pick → retrieve → overview → roast works end to end; the roast still
  streams and renders personalia, papers, stats and charts as before.

## Commit and push

Commit using this file's exact filename, then push.
