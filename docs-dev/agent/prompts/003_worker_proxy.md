# Task: Worker proxy with a non-streaming roast

## Goal

Stand up the Cloudflare Worker that proxies a single non-streaming roast request
from the front end to OpenRouter, holding the key as a secret and carrying the
content rules in the system prompt.

## Scope

Implement only the Worker proxy and the minimal front-end call to exercise it. Do
not implement streaming, rate limiting, file upload, sharing, or any data-source
integration.

## Required reading

`docs-dev/reference/primary_authoritative/specification.md`: Architecture (The
Worker; Spend caps), Data schemas (front end → Worker; Worker → OpenRouter;
Configuration), Domain rules (roast content, register, and safety).

## Dependencies

`002_frontend_shell` (the UI, the intensity control, and `src/config.ts` exist).

## Required changes

1. Create `worker/` with a wrangler project, `[vars]` (`ALLOW_ORIGIN`,
   `MODEL_ALLOWLIST`, `MAX_INPUT_CHARS`), and a secret `OPENROUTER_API_KEY`
   (local development via `worker/.dev.vars`, git-ignored).
2. Implement the request flow: CORS preflight (`OPTIONS`) and origin pinning to
   the exact `ALLOW_ORIGIN`; validation of method, content type, body presence,
   input size (against `MAX_INPUT_CHARS`), and the requested model (against
   `MODEL_ALLOWLIST`); assemble the system prompt (with the content rules and the
   chosen intensity) plus the supplied text wrapped as untrusted input; call
   OpenRouter (non-streaming); return the roast as JSON.
3. Wire the front end to POST `{ profile, intensity }` to `WORKER_URL` and
   display the returned roast in the output area.

## Do not implement

Do not implement streaming (SSE pass-through), KV / rate limiting, spend-cap
code, file parsing, sharing, or any external data source. Do not place any key in
the front end.

## Acceptance criteria

The task is complete when a pasted profile sent from the Pages origin returns a
roast that obeys the content rules, requests from other origins are rejected by
CORS, oversized or disallowed-model requests are rejected with the correct
status, and no secret appears in the front-end bundle.

## Automated checks

```bash
npm run build                                 # front end builds
cd worker && npx wrangler deploy --dry-run    # worker type-checks/builds
```

## Manual verification

Deploy the Worker (`wrangler deploy`), paste a short profile in the UI, and
confirm a roast returns and stays within the content rules; confirm a request
with a forged `Origin` is rejected.

## Commit and push

If and only if the scope was followed and checks pass, create one commit on
`main` using this file's exact filename (`003_worker_proxy.md`) as the commit
message, then push.

## Final report

End with the required five-section final report specified in `AGENTS.md`.
