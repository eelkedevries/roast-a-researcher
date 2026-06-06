# Task: GitHub retrieval (Worker)

## Goal

Add a Worker path that retrieves a developer's public GitHub profile (and repos /
languages) from a username (or `github.com` URL) and returns it as roast-ready
text.

## Scope

Implement only the Worker-side GitHub retrieval and its request/response
contract. The user-facing panel is `012_source_input_panel`. Do not implement
other sources.

## Required reading

`docs-dev/reference/primary_authoritative/specification.md`: Domain rules (Source
inputs and validation; Later data sources — GitHub), Architecture (retrieval via
the Worker).

## Dependencies

`003_worker_proxy`; shares the retrieval contract introduced in `009_orcid`.

## Required changes

1. Worker: accept a GitHub username or `github.com` URL and call the public
   GitHub REST API server-side (profile, repos, languages). The unauthenticated
   limit is 60 requests/hour per IP; support an optional `GITHUB_TOKEN` Worker
   secret to raise it. Assemble the profile and notable repos into text.
2. Return `{ text }` on success or `{ error, reason }` on failure (unknown user,
   rate limited, source error), matching the `009` contract.
3. Anchor on the username, not an inferred name.

## Do not implement

Do not implement:
- the front-end panel (`012`);
- ORCID/OpenAlex or arbitrary scraping; storing fetched data.

## Acceptance criteria

The task is complete when:
- a valid username/URL returns assembled profile + repo text via the Worker;
- an unknown user or rate-limit condition returns a clear `{ error, reason }`.

## Automated checks

```bash
npm run build
cd worker && npx wrangler deploy --dry-run
```

## Manual verification

Look up a real username and confirm profile/repo text; confirm an unknown user
returns the error and reason.

## Commit and push

If and only if the scope was followed and checks pass, create one commit on
`main` using this file's exact filename (`011_github.md`) as the commit message,
then push.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required five-section final report specified in `AGENTS.md`.
