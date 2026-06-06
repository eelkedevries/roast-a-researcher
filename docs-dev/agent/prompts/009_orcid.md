# Task: ORCID lookup (later phase)

## Goal

Add Worker-side ORCID lookup from an iD, folding the public record (employment,
education, bio, work titles) into the roast input.

## Scope

Implement only ORCID retrieval through the Worker and its use as roast input.
This is a later-phase prompt; run it only after the first version (`004`–`008`)
is complete. Do not implement other data sources.

## Required reading

`docs-dev/reference/primary_authoritative/specification.md`: Domain rules (Later
data sources — ORCID; identity anchored on a stable identifier), Architecture
(retrieval goes through the Worker, never the browser, never by scraping;
Repository layout).

## Dependencies

`003_worker_proxy`. The first version (`004`–`008`) is complete.

## Required changes

1. Worker: accept an ORCID iD, call the ORCID public API server-side with a
   read-public token held as a Worker secret, and assemble employment, education,
   bio, and work titles into text. Verify CORS support and the token flow at
   build.
2. Front end: let the user supply an iD; show the retrieved record in the
   editable field for review before roasting.
3. Anchor identity on the iD, not on an inferred name.

## Do not implement

Do not implement:
- browser-side ORCID calls or any scraping;
- OpenAlex, GitHub, or Crossref (separate prompts);
- storing fetched records.

## Acceptance criteria

The task is complete when:
- a valid iD yields works/affiliations added to the roast input via the Worker,
  with the read-public token kept server-side.

## Automated checks

```bash
npm run check
cd worker && npx wrangler deploy --dry-run
```

## Manual verification

Enter a populated iD and confirm affiliations and works appear in the editable
field and roast.

## Commit and push

If and only if the scope was followed and checks pass, create one commit on
`main` using this file's exact filename (`009_orcid.md`) as the commit message,
then push.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required five-section final report specified in `AGENTS.md`.
