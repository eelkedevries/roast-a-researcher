# Task: Search a researcher by name

## Goal

Let users type a researcher's name and pick from candidate matches (name +
affiliation), which then feed retrieval — so an exact ORCID/OpenAlex/GitHub
identifier is not required.

## Scope

Implement only a Worker `/search` path and a front-end candidate picker wired
into the source-input panel. Identifier-anchored: results resolve to a concrete
source id, never free-text scraping.

## Required reading

`docs-dev/reference/primary_authoritative/specification.md`: Domain rules (Source
inputs and validation; Later data sources), Architecture.

## Dependencies

`011_github` (the `/retrieve` contract) and `012_source_input_panel` (the input
UI). Per-source availability follows retrieval: GitHub works now; OpenAlex/ORCID
once `009`/`010` and their keys exist. This extends the spec's "Source inputs and
validation" rule — update the specification (and bump its version) when this is
run.

## Required changes

1. Worker: add a `/search` path accepting `{ source, query }`. For GitHub use the
   public user-search API; for OpenAlex/ORCID use their author search (only when
   those sources are enabled). Return a short candidate list `{ id, name,
   affiliation }`.
2. Front end: in the source panel, allow a name query, show the candidate list,
   and on selection set the chosen id and validate/retrieve it as today.
3. Sources whose retrieval is not available yet are skipped with a clear message.

## Do not implement

Do not implement:
- arbitrary web search or scraping;
- ranking beyond what the source API returns;
- persistence of queries or results.

## Acceptance criteria

The task is complete when:
- typing a name returns candidates for the available source(s);
- selecting a candidate retrieves it and feeds the roast;
- unsupported sources are messaged clearly;
- the build and Worker dry-run pass.

## Automated checks

```bash
npm run check
cd worker && npx wrangler deploy --dry-run
```

## Manual verification

Search a GitHub name, pick a result, and roast; confirm OpenAlex/ORCID show a
"needs setup" message until their keys exist.

## Commit and push

If and only if the scope was followed and checks pass, create one commit on
`main` using this file's exact filename (`017_name_search.md`) as the commit
message, then push.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required five-section final report specified in `AGENTS.md`.
