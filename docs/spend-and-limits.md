# Spend controls and rate limiting

Roast a Researcher is funded by the owner: every roast costs a small amount on
OpenRouter. Three independent controls bound that exposure, so no single bug or
abusive user can run up an unbounded bill.

## 1. OpenRouter account balance (hard ceiling)

OpenRouter is pay-as-you-go. A small, manually topped-up credit balance caps
total lifetime exposure regardless of any bug: once credits are exhausted,
requests are rejected. Keep the balance modest and top it up deliberately.

## 2. Per-key daily budget (daily reset)

The OpenRouter API key is created with a daily USD budget (a Guardrail). Once the
day's budget is reached, further requests are rejected until the next day. Set
this in the OpenRouter dashboard against the key the Worker uses.

> The exact rejection status code is reported variously as `402` (credits
> exhausted) and `403` (guardrail limit). Confirm the current behaviour for your
> key when you set the budget; the Worker surfaces either as a transient
> `upstream_error` to the user.

## 3. Worker per-IP daily cap (stops abuse before OpenRouter)

The Worker enforces a per-IP daily limit so abuse is rejected before it ever
reaches OpenRouter:

- The client IP is taken **only** from `CF-Connecting-IP` (set by Cloudflare at
  the edge). `X-Forwarded-For` is never trusted — a client can forge it.
- The IP is hashed (SHA-256 with the secret `IP_HASH_SALT`) before use, so no raw
  IP is stored.
- A counter in Workers KV, keyed `rl:<UTC-date>:<hashed-ip>`, is incremented per
  request and given a TTL that expires at the end of the UTC day — an automatic
  daily reset.
- Over the limit, the Worker returns a plain `429` with
  `{ "error": "rate_limited", … }`, which the front end shows as a plain message.

The native Cloudflare rate-limiting binding is **not** used for the daily cap: its
period is limited to 10 or 60 seconds, so it cannot express a daily total. If
strict accuracy is ever needed, a Durable Object keyed by the hashed IP is the
documented upgrade.

### Current settings

| Setting | Value | Where |
|---|---|---|
| `DAILY_LIMIT` | `50` roasts per IP per UTC day | `worker/wrangler.toml` `[vars]` |
| `IP_HASH_SALT` | secret | `wrangler secret put` / `worker/.dev.vars` |
| KV namespace | `RATE_LIMIT` | `worker/wrangler.toml` `[[kv_namespaces]]` |
| OpenRouter per-key daily budget | _set by the owner in the OpenRouter dashboard_ | OpenRouter |
| OpenRouter account balance | _topped up manually_ | OpenRouter |

Adjust `DAILY_LIMIT` in `wrangler.toml` and redeploy the Worker to change the
per-IP cap.

## 4. Model choice (per-roast cost)

The per-roast cost is dominated by the model, configured in `worker/roast.md`
(`model` and the `models`/`routing` buckets). After the June 2026 humour pilot,
production routes the mild tier to `google/gemini-2.5-flash` and the stronger tiers +
regenerate to `anthropic/claude-sonnet-4.5` (funnier; see `docs/evaluation.md`). Since
the default intensity is the strongest tier, most roasts use Sonnet — a higher
per-roast cost, still bounded by the per-IP daily cap and the OpenRouter per-key
budget. Revert to flash-only with one line in `roast.md`. Verified OpenRouter prices
(June 2026, USD per 1M tokens, input/output) — keep this table and `eval/prices.json`
in step when prices change:

| Model | Input | Output |
|---|---|---|
| `google/gemini-2.5-flash-lite` | 0.10 | 0.40 |
| `google/gemini-2.5-flash` (current default) | 0.30 | 2.50 |
| `google/gemini-2.5-pro` | 1.25 | 10 |
| `anthropic/claude-sonnet-4.5` | 3.00 | 15 |

Routing is **selective**: only stronger intensity tiers and regenerate use the
`quality` bucket, so a costlier model is never applied to every request. Use the eval
harness (`docs/evaluation.md`) to weigh a stronger model's humour gain against its
cost before switching, and remember the per-IP daily cap and the OpenRouter per-key
budget still bound total exposure.
