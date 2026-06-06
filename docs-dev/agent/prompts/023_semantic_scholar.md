# Task: Semantic Scholar enrichment

## Goal

Enrich the top retrieved works with Semantic Scholar's free, keyless data —
influential-citation counts and TLDR one-line summaries — keyed by DOI, giving the
roast crisp "what this paper actually claims" material and a sharper impact signal
than raw citation counts.

## Scope

Add Semantic Scholar as a keyless enrichment of works that already carry a DOI
(from OpenAlex). Implement the Worker-side call and its inclusion in the retrieved
text. Do not make it a standalone identifier source in the input panel.

## Required reading

`docs-dev/reference/primary_authoritative/specification.md`: Domain rules (Later
data sources; Source inputs and validation; Roast content, register, and safety),
Architecture (The Worker). This adds a source — update the specification's "Later
data sources" and bump its version when this is run.

## Dependencies

`010_openalex` (top works; widen the works `select` to include the DOI).

## Required changes

1. Worker: collect DOIs from the top OpenAlex works and call Semantic Scholar's
   keyless Graph API batch endpoint
   (`POST https://api.semanticscholar.org/graph/v1/paper/batch`,
   `fields=title,influentialCitationCount,tldr`, body `{ ids: ["DOI:…", …] }`).
   No API key; respect the unauthenticated rate limit and degrade silently on
   429/error.
2. Merge each paper's TLDR summary and influential-citation count into the
   corresponding work line in the retrieved text; omit per-work when absent.
3. Keep it bounded (only the top works already shown) so input size and latency
   stay within limits.

## Do not implement

Do not implement:
- a paid/keyed Semantic Scholar tier or the per-paper (non-batch) loop for many
  papers;
- a new input-panel source or any UI/visualisation;
- storing fetched data.

## Acceptance criteria

The task is complete when:
- top works with a DOI gain a TLDR and/or influential-citation count in the
  retrieved text, and works without a DOI or match are unchanged;
- the call is keyless and failures degrade silently;
- the specification's source list is updated and its version bumped;
- the build and Worker dry-run pass.

## Automated checks

```bash
npm run check
cd worker && npx wrangler deploy --dry-run
```

## Manual verification

Retrieve an OpenAlex author whose top works have DOIs; confirm TLDRs / influential
counts appear; confirm a DOI-less work is left as-is.

## Commit and push

If and only if the scope was followed and checks pass, create one commit on
`main` using this file's exact filename (`023_semantic_scholar.md`) as the commit
message, then push.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required five-section final report specified in `AGENTS.md`.
