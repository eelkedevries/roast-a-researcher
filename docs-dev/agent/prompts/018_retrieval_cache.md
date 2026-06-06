# Task: Cache retrieved source data (Worker KV)

## Goal

Cache `/retrieve` responses for public records (ORCID/OpenAlex/GitHub) in Workers
KV with a short TTL, to cut repeat external API calls and latency. The roast
itself is still generated fresh per request and is never cached.

## Scope

Implement only Worker-side caching of retrieval results. Do not cache the roast or
any user-supplied text.

## Required reading

`docs-dev/reference/primary_authoritative/specification.md`: Architecture (Data
flow and statelessness; Rate limiting and abuse protection — the existing KV),
Domain rules (Privacy and reputational handling), Locked decisions.

## Dependencies

`011_github` (`/retrieve`). **Spec conflict — resolve first.** This conflicts with
the locked "Data flow and statelessness" decision ("the Worker retains nothing
after a request except the rate-limit counter; no profile text is logged or
stored"): cached retrieved records are stored profile data. Before implementing,
revise the specification — state that only *public-record retrievals* are cached
(never user-pasted/uploaded text and never the roast), set the TTL, update "Data
flow and statelessness" + Locked decisions, and bump the version. Do not proceed
until the spec is revised.

## Required changes

1. Add a KV namespace (or a dedicated cache binding) keyed
   `cache:<source>:<normalized-id>`, storing the retrieved text with a TTL
   (default 7 days; confirm).
2. In `/retrieve`, check the cache first; on a miss, fetch then store; never cache
   error responses; cache only successful public-record retrievals.
3. Add a privacy line noting that public records are cached and for how long.

## Do not implement

Do not implement:
- caching the roast output or any user-supplied (pasted/uploaded) text;
- a database or cross-user sharing beyond the public-record cache;
- caching of error responses.

## Acceptance criteria

The task is complete when:
- the specification has been revised to permit public-record caching (version
  bumped);
- a repeat retrieval of the same id within the TTL is served from KV with no
  upstream call; errors are not cached; only public-record retrievals are cached;
- the build and Worker dry-run pass.

## Automated checks

```bash
npm run check
cd worker && npx wrangler deploy --dry-run
```

## Manual verification

Retrieve the same GitHub id twice and confirm the second is a cache hit (via a log
or a debug header) and noticeably faster.

## Commit and push

If and only if the scope was followed and checks pass, create one commit on
`main` using this file's exact filename (`018_retrieval_cache.md`) as the commit
message, then push.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required five-section final report specified in `AGENTS.md`.
