# Task: Website / arbitrary URL retrieval

## Goal

Allow the user to supply an arbitrary website URL (personal site, university
profile, lab page) and have the Worker fetch it and extract readable text for the
roast. This reverses the earlier "no arbitrary URL scraping" stance; the
specification is updated in the same change.

## Scope

A new `website` source end to end: front-end detection + labels, Worker fetch and
text extraction with safety guards, and the spec update. Known structured hosts
(ORCID, OpenAlex, GitHub, Semantic Scholar, DBLP) still route to their APIs.

## Required reading

`docs-dev/reference/primary_authoritative/specification.md`: Source inputs and
validation, Later data sources, Privacy and reputational handling, Locked
decisions, Scope. Architecture (retrieval goes through the Worker, never the
browser).

## Required changes

1. `src/sources.ts`: add `'website'` to `SourceKind`; in `detectSource`, an
   `http(s)`/host-like URL that matches no known structured host resolves to
   `{ source: 'website', id: <url> }` instead of `null`. Bare non-URL tokens still
   fall through to the GitHub-username rule.
2. `worker/src/index.ts`: add a `website` case to `handleRetrieve`. Implement
   `retrieveWebsite`: validate the URL (http(s) only); **block** localhost,
   `.local`/`.internal`, and private/loopback/link-local/CGNAT/metadata IPs (SSRF
   guard); fetch with a `User-Agent`, `redirect: 'follow'`, and an ~8s
   `AbortController` timeout; require an HTML/plain content type; cap the body
   size; extract `<title>` + body text (drop `script`/`style`/`noscript`/comments,
   turn block tags into line breaks, strip remaining tags, decode common
   entities), trim to the input cap; return `{ text }` or a clear `{ error,
   reason }` (image-/script-only pages fail gracefully).
3. `src/ui.ts`: `SOURCE_LABELS.website = 'Website'`; `recordUrl` returns the URL
   for `website`; update the link-row placeholder and the "Profile links" sub-label
   to mention any profile/website URL; keep `website` out of `SEARCH_SOURCES`
   (no name search). Soften the unsupported-link copy.
4. Specification: rewrite the no-scraping statements in Scope, Source inputs and
   validation, and Later data sources to describe website retrieval and its safety
   limits; note in Privacy that fetched content is third-party public web data;
   bump the version and date.

## Do not implement

- name search over websites; JS rendering / headless browsing;
- storing fetched pages beyond the existing KV retrieval cache;
- following non-http(s) schemes or fetching blocked hosts.

## Acceptance criteria

- `npm run check` passes and `wrangler deploy --dry-run` succeeds.
- A normal `https://…` profile/personal URL resolves to `website` and returns
  extracted text; a blocked/instructure-only/non-HTML URL fails with a clear reason.
- Structured hosts still route to their existing sources.

## Automated checks

```bash
npm run check
cd worker && npx wrangler deploy --dry-run
```

## Manual verification

Live fetch needs network the build container lacks; verified after deploy against a
real static profile page and a JS-heavy page (expected to return little).

## Commit and push

If and only if scope was followed and checks pass, commit using this file's exact
filename (`036_website_source.md`) as the message, then push.

## Final report

End with the required five-section final report specified in `AGENTS.md`.
