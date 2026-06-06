# Task: ORCID retrieval (Worker)

## Goal

Add a Worker path that retrieves a researcher's public ORCID record from an iD
(or `orcid.org` URL) and returns it as roast-ready text.

## Scope

Implement only the Worker-side ORCID retrieval and its request/response contract.
The user-facing multi-input panel is `012_source_input_panel`. Do not implement
other sources.

## Required reading

`docs-dev/reference/primary_authoritative/specification.md`: Domain rules (Source
inputs and validation; Later data sources — ORCID; identity anchored on a stable
identifier), Architecture (retrieval goes through the Worker, never the browser,
never by scraping).

## Dependencies

`003_worker_proxy` (the deployed Worker).

## Required changes

1. Worker: add a retrieval request the front end can call (a distinct path or an
   `action` in the body), accepting an ORCID iD or an `orcid.org` URL. Extract and
   validate the iD (format + checksum), call the ORCID public API server-side with
   a read-public token held as the Worker secret `ORCID_TOKEN`, and assemble
   employment, education, bio, and work titles into text. Verify CORS support and
   the token flow at build.
2. Return `{ text }` on success, or `{ error, reason }` with an appropriate status
   on failure (invalid identifier, not found, source error).
3. Anchor identity on the iD, never on an inferred name.

## Do not implement

Do not implement:
- the front-end input panel (`012`) or any UI;
- OpenAlex, GitHub, or arbitrary URL scraping;
- storing fetched records.

## Acceptance criteria

The task is complete when:
- a valid iD or `orcid.org` URL returns assembled text via the Worker, with the
  read-public token kept server-side;
- an invalid or unknown iD returns a clear `{ error, reason }`.

## Automated checks

```bash
npm run build
cd worker && npx wrangler deploy --dry-run
```

## Manual verification

With a populated iD, confirm assembled text returns; with a malformed or unknown
iD, confirm the error and reason.

## Commit and push

If and only if the scope was followed and checks pass, create one commit on
`main` using this file's exact filename (`009_orcid.md`) as the commit message,
then push.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required five-section final report specified in `AGENTS.md`.
