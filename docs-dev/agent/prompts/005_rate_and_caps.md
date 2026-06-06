# Task: Per-IP daily rate limit and spend caps

## Goal

Cap abuse with a hashed-IP daily counter in Workers KV that returns a plain
`429`, and document the OpenRouter balance and per-key budget that bound spend.

## Scope

Implement only rate limiting and the spend-cap setup/documentation. Do not
implement adjacent systems or future prompts.

## Required reading

`docs-dev/reference/primary_authoritative/specification.md`: Architecture (Rate
limiting and abuse protection; Spend caps), Data schemas (Configuration; Worker →
front end error), Domain rules (Error and failure handling), Open items.

## Dependencies

`003_worker_proxy` (the deployed Worker). Best run after `004_streaming`.

## Required changes

1. Create a Workers KV namespace and bind it in `worker/wrangler.toml`. Add
   `DAILY_LIMIT` to `[vars]` (default `10` roasts per IP per UTC day — confirm
   with the owner). Add `IP_HASH_SALT` as a Worker secret.
2. Worker: take the client IP only from `CF-Connecting-IP` (never
   `X-Forwarded-For`), hash it with SHA-256 + `IP_HASH_SALT`, and use a KV counter
   keyed `rl:<UTC-date>:<hashed-ip>` with a TTL that expires at end of day. Before
   calling OpenRouter, increment/check; if over `DAILY_LIMIT`, return `429` with
   `{ error: "rate_limited", message }`. Do not use the native Cloudflare
   rate-limiting binding for the daily cap.
3. Front end: render the `429` plainly (not in character).
4. Document in `docs/` the three spend controls — OpenRouter account balance,
   per-key daily budget/Guardrail (confirm the rejection status code, reported as
   `402`/`403`, at build), and the Worker per-IP cap — and record the chosen
   `DAILY_LIMIT` and budget figure.

## Do not implement

Do not implement:
- the native Cloudflare rate-limiting binding as the daily cap (period limited to
  10/60 s) or a Durable Object (documented upgrade only);
- file parsing, sharing/export, or any data source.

## Acceptance criteria

The task is complete when:
- exceeding `DAILY_LIMIT` from one IP returns a plain `429` with the
  `rate_limited` shape; under the limit still roasts;
- the counter resets daily via TTL and stores only a hashed IP plus a count;
- the OpenRouter per-key budget is set and verified; the spend-cap docs exist.

## Automated checks

```bash
npm run check
cd worker && npx wrangler deploy --dry-run
```

## Manual verification

With a low `DAILY_LIMIT`, send repeated requests from one IP and confirm a plain
`429` after the limit; confirm KV holds only `rl:<date>:<hash>` keys.

## Commit and push

If and only if the scope was followed and checks pass, create one commit on
`main` using this file's exact filename (`005_rate_and_caps.md`) as the commit
message, then push.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required five-section final report specified in `AGENTS.md`.
