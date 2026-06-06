# Task: ORCID grants and awards

## Goal

Extend the Worker's ORCID retrieval to also pull the researcher's funding (grants)
and distinctions (awards), so the roast input carries grant-chasing and
prize-cabinet material, matching what a richer ORCID record exposes.

## Scope

Extend only the existing ORCID `/retrieve` path. Add no new source and no UI.

## Required reading

`docs-dev/reference/primary_authoritative/specification.md`: Domain rules (Source
inputs and validation; Later data sources — ORCID; Roast content, register, and
safety), Architecture (retrieval via the Worker).

## Dependencies

`009_orcid` (the ORCID retrieval path and iD parsing/validation already exist).

## Required changes

1. In the ORCID path, read the public record's `fundings` (grants: title, funder,
   type, years) and `distinctions` (awards: title, organisation, year) — either
   from the full `/record` already fetched, or via the public sub-endpoints
   (`pub.orcid.org/v3.0/{id}/fundings`, `/distinctions`) with the same keyless
   `Accept` header.
2. Append compact, labelled blocks to the assembled text (e.g. `Funding:` and
   `Awards:`), each line factual; omit a block cleanly when absent.
3. Keep everything keyless; the optional `ORCID_TOKEN` is used only when present.

## Do not implement

Do not implement:
- any new source or any paid/keyed API;
- a front-end change or visualisation;
- storing fetched records.

## Acceptance criteria

The task is complete when:
- an iD with funding/awards yields labelled `Funding:` / `Awards:` lines in the
  retrieved text, and an iD without them omits the blocks cleanly;
- retrieval stays keyless and the build and Worker dry-run pass.

## Automated checks

```bash
npm run check
cd worker && npx wrangler deploy --dry-run
```

## Manual verification

Retrieve an ORCID iD known to have grants and awards; confirm both appear and are
factual; confirm an iD without them omits the blocks.

## Commit and push

If and only if the scope was followed and checks pass, create one commit on
`main` using this file's exact filename (`020_orcid_grants_awards.md`) as the
commit message, then push.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required five-section final report specified in `AGENTS.md`.
