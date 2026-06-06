# Configuration

All adjustable settings live in two committed, non-secret places, plus the Worker
secrets. No secret is ever shipped to the browser.

## Front end — `src/config.ts`

| Setting | Meaning |
|---|---|
| `workerUrl` | the deployed Worker endpoint the front end calls |
| `defaultModel` | the model slug requested by default |
| `maxInputChars` | client-side input cap (mirrors the Worker's) |
| `defaultIntensity` | intensity used when the user does not choose (`spicy`) |
| `copy.*` | all user-facing text: tagline, framing, helper lines, privacy notice + provider-policy link, and the in-character error strings |

Change a value and redeploy the front end (the Pages workflow).

## Worker — `worker/wrangler.toml` `[vars]` (committed, non-secret)

| Var | Meaning |
|---|---|
| `ALLOW_ORIGIN` | the exact Pages origin permitted by CORS |
| `MODEL_ALLOWLIST` | comma-separated slugs the Worker will forward |
| `MAX_INPUT_CHARS` | authoritative input cap |
| `DAILY_LIMIT` | roasts per hashed IP per UTC day |

A `[[kv_namespaces]]` binding (`RATE_LIMIT`) holds the daily counter.

## Worker secrets (never committed)

Set with `wrangler secret put`, or `worker/.dev.vars` for local `wrangler dev`
(git-ignored):

| Secret | Meaning |
|---|---|
| `OPENROUTER_API_KEY` | the OpenRouter key; the only component that calls OpenRouter |
| `IP_HASH_SALT` | salt for hashing the client IP before it is used as a rate-limit key |

## Model slug

The default is `google/gemini-2.5-flash-lite` (a cheap flash-class model). Slugs
and prices change; verify against `openrouter.ai/models` before changing
`defaultModel`/`MODEL_ALLOWLIST`. See also `docs/spend-and-limits.md`.
