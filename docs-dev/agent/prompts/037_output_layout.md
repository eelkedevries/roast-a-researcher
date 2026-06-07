# Task: Structured output layout (Personalia / Profile / Papers / The numbers)

## Goal

Reorganise the roast output into four sections — **Personalia**, **Profile** (the
roast), **Papers**, and **The numbers** — with a rich, model-extracted personalia
(position, current/previous affiliations, research domain, focus keywords,
education) plus Profiles/Grants/Awards subsections and a papers list with citation
counts.

## Scope

Front-end output rendering, the roast model's output contract, and the spec's
output-presentation section. Personalia + Papers are model-extracted from the
already-fetched text; Profiles come from the user's links; The numbers reuses the
existing stats/charts.

## Required reading

`docs-dev/reference/primary_authoritative/specification.md`: Roast output
presentation, Data schemas (Worker → front end). The model must not invent values
(content rules).

## Required changes

1. Worker `buildSystemPrompt`: replace the `{name, affiliation}` header with a
   structured JSON block (`name, position, currentAffiliations[],
   previousAffiliations[], researchDomain, researchFocus[], education[], grants[],
   awards[], papers[{title,venue,year,citations}]`) drawn only from the supplied
   text, followed by a `===ROAST===` marker, then the roast. Raise
   `MAX_OUTPUT_TOKENS` to fit the JSON + roast.
2. `src/ui.ts`: new sectioned output markup; `renderResult`/`renderProfiles`/
   `renderSubList`/`renderPapers`/`toggleNumbers`; rewrite the SSE parser to buffer
   to the marker, parse the JSON, then stream the roast; update the demo and the
   reset/`hidden` handling. Remove the old `fillPersonalia` and `p-affil`/`p-sources`.
3. `src/style.css`: styles for `.rsec`, `.subsec`, `.plist`, `.papers`.
4. Spec: rewrite Roast output presentation to the four-section, JSON-block-plus-
   marker model; bump the version.

## Do not implement

- Worker-side structured parsing of the source APIs (personalia is model-derived);
- storing any of the structured output;
- changes to sharing/export (still the roast text/image).

## Acceptance criteria

- `npm run check` passes and `wrangler deploy --dry-run` succeeds.
- A roast renders the four sections; empty fields/sections are omitted; if the
  model omits the JSON block, the whole output still shows as the roast.

## Automated checks

```bash
npm run check
cd worker && npx wrangler deploy --dry-run
```

## Manual verification

After deploy: roast a populated profile and confirm the sections render and the
JSON/marker never leak into the visible roast.

## Commit and push

If and only if scope was followed and checks pass, commit using this file's exact
filename (`037_output_layout.md`) as the message, then push.

## Final report

End with the required five-section final report specified in `AGENTS.md`.
