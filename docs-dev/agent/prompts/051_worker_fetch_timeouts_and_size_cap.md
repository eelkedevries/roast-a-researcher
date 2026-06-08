# Task: Worker upstream fetch timeouts and streaming response-size cap

## Goal

Bound every Worker→upstream `fetch()` with a connect/headers deadline, and hard-cap
arbitrary website response bodies by streamed byte count (not just `Content-Length`).
These were the two items deferred from `049`. Behaviour-preserving except that hung
upstreams now fail fast and oversize chunked bodies are rejected. (Planned via
ultraplan; see `~/.claude/plans/vivid-watching-pretzel.md`.)

## Required changes (`worker/src/index.ts` only)

1. Add two module-level helpers (above `fetchPageHtml`):
   - `fetchWithTimeout(url, init = {}, ms = 12000)` — manual `AbortController` +
     `setTimeout`, `clearTimeout` in `finally` (matches the existing crawl pattern).
     The timer bounds connect/time-to-first-byte only; cleared once headers arrive, so
     it never aborts a streaming body. NOT `AbortSignal.timeout` (workerd).
   - `readTextCapped(res, limit)` → `{ text } | { overflow: true }` — `Content-Length`
     fast-path, then stream `res.body.getReader()` accumulating `byteLength`, cancel and
     return `overflow` past the cap; streaming `TextDecoder` + final flush for UTF-8.
2. Convert the **21** untimed upstream `fetch(` calls to `fetchWithTimeout(` (default
   12s); the OpenRouter relay uses 15s. Leave the 2 existing manual-timeout crawl
   fetches, the helper's own internal `fetch`, and the `async fetch(request, env)`
   handler method untouched.
3. Cap the two website-body reads with `readTextCapped(res, 5_000_000)`:
   - `fetchPageHtml`: overflow ⇒ `null` (unchanged null contract).
   - `retrieveWebsite` seed: overflow ⇒ `too_large`/413, read error ⇒ `source_error`/502
     (the exact existing split preserved).

## Out of scope (deliberate)

- No cumulative deadline across `buildOpenalex`'s sequential round-trips (per-fetch
  timeout already removes the single-hang stall).

## Acceptance criteria

- `cd worker && npx wrangler deploy --dry-run` succeeds; `npm run check` passes.
- Exactly 21 `fetchWithTimeout` call sites; the relay carries `15000`; the 413/502
  website errors and roast streaming are unchanged.

## Commit and push

Commit using this file's exact filename, then push; confirm CI `Deploy Worker` is green.
