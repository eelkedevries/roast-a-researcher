# Task: arXiv preprints (name-matched)

## Goal

Add arXiv as a keyless source of a researcher's preprints (title, abstract, year,
categories) for roast material, in preprint-heavy fields (physics, CS, maths).

## Scope

Add a Worker `/retrieve` case for `arxiv` and a search entry, plus front-end wiring.

## Required reading

`docs-dev/reference/primary_authoritative/specification.md`: Domain rules (Source
inputs and validation — **identity anchored on a stable identifier**; Privacy and
reputational handling; Roast content, register, and safety), Architecture.

## Dependencies

`012` (input panel / search). **Spec tension — resolve first.** arXiv has no author
IDs, so this can only match by name and may include a namesake's papers, which
conflicts with the locked anti-disambiguation rule. Before implementing, revise the
specification to permit *name-matched literature sources* under explicit conditions
(clearly labelled as name-matched, user-selected, never auto-merged as verified
identity), and bump the version.

## Required changes

1. Worker `/retrieve` (`source: arxiv`, id = the name query): call
   `http://export.arxiv.org/api/query?search_query=au:<name>&max_results=…`, parse the
   Atom XML, and assemble a bounded list of recent preprints (title, year, truncated
   abstract, primary category) into text — explicitly prefixed as name-matched.
2. Search: surface a single synthetic candidate (e.g. `arXiv: preprints matching
   "<name>"`) so selection is explicit; the resulting link is labelled name-matched.
3. Front end: add `arxiv` to the source kinds and labels; carry the name as the id;
   show a clear "name-matched — may include namesakes" note on the row.

## Do not implement

Do not implement:
- treating an arXiv name match as a verified identity or merging it silently;
- full-text/PDF retrieval; charts; storing data.

## Acceptance criteria

The task is complete when an arXiv name query returns recent preprints into the
roast, clearly labelled name-matched; the spec permits this with safeguards and its
version is bumped; `npm run check` + the Worker dry-run pass.

## Automated checks

```bash
npm run check
cd worker && npx wrangler deploy --dry-run
```

## Manual verification

Query an author with arXiv preprints; confirm a plausible, name-matched list
appears with the caveat shown.

## Commit and push

If and only if the scope was followed and checks pass, create one commit on `main`
using this file's exact filename (`030_arxiv.md`) as the commit message, then push.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required five-section final report specified in `AGENTS.md`.
