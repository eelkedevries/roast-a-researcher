# Task: Source input panel with per-input validation

## Goal

Add a multi-input panel for structured-source identifiers/URLs (ORCID, OpenAlex,
GitHub) with add/remove, and validate each on Roast — a tick when data is
retrieved, a cross plus a brief reason when not — merging retrieved text into the
editable roast input.

## Scope

Implement only the front-end input panel and its validation wiring against the
Worker retrieval paths. Do not change the retrieval endpoints themselves.

## Required reading

`docs-dev/reference/primary_authoritative/specification.md`: Domain rules (Source
inputs and validation; Input handling), Data schemas (front end → Worker),
Architecture.

## Dependencies

`009_orcid`, `010_openalex`, `011_github` (the Worker retrieval paths exist).

## Required changes

1. Add a panel with a text box for an identifier/URL and a `+` control that adds
   another box below; each box can be removed. Accept ORCID iDs/URLs, OpenAlex
   IDs/URLs, and GitHub usernames/URLs; detect the source from the input.
2. On Roast, validate each non-empty input: call the matching Worker retrieval
   path and mark the box with a tick (text retrieved) or a cross plus a brief
   reason in small print beneath it (unrecognised identifier, unsupported URL,
   nothing found, source error). Unrecognised/arbitrary URLs fail with guidance to
   paste the text instead.
3. Merge all successfully retrieved text (plus pasted/uploaded text) into the
   editable roast input for review, then proceed with the roast.

## Do not implement

Do not implement:
- changes to the retrieval endpoints (`009`–`011`) or new sources;
- arbitrary URL scraping;
- persistence of inputs or results.

## Acceptance criteria

The task is complete when:
- the user can add/remove identifier/URL boxes;
- on Roast each input shows a tick or a cross with a reason, and retrieved text is
  merged into the roast input;
- an unrecognised/unsupported URL fails clearly rather than being scraped.

## Automated checks

```bash
npm run check
```

## Manual verification

Add an ORCID, an OpenAlex, and a GitHub input plus one junk URL; Roast; confirm
ticks/crosses with reasons and that retrieved text feeds the roast.

## Commit and push

If and only if the scope was followed and checks pass, create one commit on
`main` using this file's exact filename (`012_source_input_panel.md`) as the
commit message, then push.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required five-section final report specified in `AGENTS.md`.
