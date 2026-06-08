# Task: Worker security and reliability hardening

## Goal

Close verified security and robustness gaps in the Worker without changing the
roast behaviour or the public response shapes.

## Required changes (`worker/src/index.ts`, `worker/wrangler.toml`)

1. **Throttle `/retrieve` and `/search`** — a separate, more generous per-IP daily
   budget (`enforceRetrieveBudget`, `rt:` KV key, `RETRIEVE_DAILY_LIMIT` default
   300) so they can't be abused as an open scraping / API-key-burn proxy. Cache hits
   stay free.
2. **SSRF redirect re-check** — `redirect: 'follow'` is re-validated against
   `isBlockedHost(new URL(res.url).hostname)` in `retrieveWebsite` and `fetchPageHtml`
   (which also gains an initial host guard).
3. **`isBlockedHost`** — also block `::`, IPv4-mapped (`::ffff:…`) and NAT64
   (`64:ff9b:…`) literals.
4. **Don't burn quota on failure** — increment the roast rate-limit counter only
   after the OpenRouter call succeeds.
5. **Don't poison the cache** — when ORCID OpenAlex enrichment fails transiently,
   flag it (`X-Enrichment-Degraded`) and cache that result for 300s, not 24h.
6. **Stop info disclosure** — drop the OpenAlex API-key state and raw upstream error
   bodies from client-facing messages.
7. **`$`-in-exclude bug** — use function replacers in `buildSystemPrompt` so excluded
   titles containing `$&`/`` $` ``/`$'`/`$$` can't corrupt the prompt.
8. **`X-Content-Type-Options: nosniff`** on all responses (via `corsHeaders`).
9. `wrangler.toml`: add `RETRIEVE_DAILY_LIMIT = "300"`.

## Deferred (not in this prompt)

- Broad per-subrequest fetch timeouts across all upstream APIs, and the streaming
  response-size cap rework — both touch many sites / require careful streaming-decode
  handling and need manual verification against a live Worker (no tests). Worth a
  dedicated, separately-verified prompt.

## Acceptance criteria

- `npm run check` passes and `cd worker && npx wrangler deploy --dry-run` succeeds.
- Roast behaviour and response shapes unchanged.

## Commit and push

Commit using this file's exact filename, then push.
