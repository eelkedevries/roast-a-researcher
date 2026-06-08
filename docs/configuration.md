# Configuration

All adjustable settings live in three committed, non-secret places, plus the
Worker secrets. No secret is ever shipped to the browser.

## Front end — `src/config.ts`

| Setting | Meaning |
|---|---|
| `workerUrl` | the deployed Worker endpoint the front end calls |
| `maxInputChars` | client-side input cap (mirrors the Worker's) |
| `defaultIntensity` | intensity used when the user does not choose |
| `orcidLoginEnabled` | show the optional "Log in with ORCID" control |
| `copy.*` | all user-facing text: tagline, framing, helper lines, privacy notice + provider-policy link, and the in-character error strings |

Change a value and redeploy the front end (the Pages workflow).

## Model, parameters and prompt — `worker/roast.md`

The model, the generation knobs and the system prompt all live in this one file:
YAML frontmatter for the knobs (with `#` comments), the prompt instructions as
prose below the frontmatter. Edit it and redeploy the Worker.

| Frontmatter key | Meaning |
|---|---|
| `model` | the OpenRouter model slug the Worker calls (e.g. `google/gemini-2.5-flash`) |
| `maxOutputTokens` | hard cap on the roast length |
| `temperature` | sampling temperature `0`–`2`, or `default` to leave it unset |
| `topP` | nucleus sampling `0`–`1`, or `default` to leave it unset |
| `defaultIntensity` | the level used when the request omits one |
| `intensity` | the list of levels, each `{ label, directive }` (numbered by order) |

`scripts/check-config.mjs` validates this file in `npm run check` and in the
deploy workflow, so a malformed edit fails before it ships. The Worker is the sole
authority on the model — the browser never sends one.

## Worker — `worker/wrangler.toml` `[vars]` (committed, non-secret)

| Var | Meaning |
|---|---|
| `ALLOW_ORIGIN` | the exact Pages origin permitted by CORS |
| `MAX_INPUT_CHARS` | authoritative input cap |
| `DAILY_LIMIT` | roasts per hashed IP per UTC day |
| `OPENALEX_MAILTO` | contact address sent to OpenAlex (polite pool) |
| `RETRIEVE_CACHE_TTL` | seconds to cache a public-record retrieval in KV (default 24h) |
| `ORCID_OAUTH_BASE` | ORCID OAuth host (`https://orcid.org` or the sandbox) |
| `ORCID_CLIENT_ID` | the registered ORCID app's client ID (public by OAuth design) |
| `ORCID_REDIRECT_URI` | the Worker's `/auth/orcid/callback` URL |
| `APP_URL` | the Pages app URL the browser returns to after login |

A `[[kv_namespaces]]` binding (`RATE_LIMIT`) holds the daily counter and the
short-lived public-record cache.

## Worker secrets (never committed)

Set with `wrangler secret put`, or `worker/.dev.vars` for local `wrangler dev`
(git-ignored):

| Secret | Meaning |
|---|---|
| `OPENROUTER_API_KEY` | the OpenRouter key; the only component that calls OpenRouter |
| `IP_HASH_SALT` | salt for hashing the client IP before it is used as a rate-limit key |
| `OPENALEX_API_KEY` | optional; the (free) OpenAlex key for steadier rate limits |
| `ORCID_CLIENT_SECRET` | optional; enables "Log in with ORCID" (login is disabled when unset) |
| `SESSION_SECRET` | optional; signs the session token for ORCID login (login is disabled when unset) |

## Model slug

The model is fixed server-side by the `model:` key in `worker/roast.md`
(currently `google/gemini-2.5-flash`, a flash-class model). Slugs and prices
change; verify against `openrouter.ai/models` before changing it. See also
`docs/spend-and-limits.md`.
