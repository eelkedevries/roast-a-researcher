# Task: Fix stale and stub user-facing docs

## Goal

Bring `docs/` back in line with current behaviour after the config consolidation
(single `worker/roast.md`, model fixed server-side) and fill the leftover scaffold
stubs. Documentation only — no code or behaviour change.

## Required changes

1. `docs/configuration.md` — drop `defaultModel` and `MODEL_ALLOWLIST` (both
   removed); document the three config places including `worker/roast.md` (its
   frontmatter keys); add the missing `wrangler.toml` vars (OPENALEX_MAILTO,
   RETRIEVE_CACHE_TTL, ORCID_* , APP_URL) and optional secrets (OPENALEX_API_KEY,
   ORCID_CLIENT_SECRET, SESSION_SECRET); correct the model slug to
   `google/gemini-2.5-flash`.
2. `docs/deployment.md` — `WORKER_URL` → `workerUrl`; list the optional ORCID/
   OpenAlex secrets.
3. `docs/privacy.md` — "What is stored": disclose the short-lived public-record
   cache (incl. scraped website text) alongside the rate-limit counter.
4. `docs/spend-and-limits.md` — `DAILY_LIMIT` current value `10` → `50`.
5. `docs/installation.md`, `docs/usage.md` — replace the unfilled scaffold stubs
   with the real prerequisites/flow.
6. `docs/troubleshooting.md` — remove the leftover "Replace the placeholders" line.

## Acceptance criteria

- Docs match the committed `worker/roast.md`, `wrangler.toml`, `src/config.ts`.
- No code change; `npm run check` unaffected.

## Commit and push

Commit using this file's exact filename, then push.
