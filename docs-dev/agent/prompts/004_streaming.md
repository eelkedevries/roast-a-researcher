# Task: Stream the roast (SSE pass-through + typing effect)

## Goal

Stream the roast token by token: relay OpenRouter's SSE through the Worker
without buffering, and have the front end read the stream and type it into the
output area.

## Scope

Implement only streaming of the existing roast path. Do not implement adjacent
systems or future prompts.

## Required reading

`docs-dev/reference/primary_authoritative/specification.md`: Architecture (The
Worker — the streaming relay; CORS), Data schemas (Worker → front end), Domain
rules (Error and failure handling).

## Dependencies

`003_worker_proxy` (the deployed Worker returns a non-streaming roast and the
front end calls it).

## Required changes

1. Worker: call OpenRouter with `stream: true` and relay the upstream body
   directly — `new Response(upstream.body, { headers: { "Content-Type":
   "text/event-stream", "Cache-Control": "no-cache", ...corsHeaders } })`. Never
   call `.text()` or `.json()` on the streamed response. Keep all
   validation/CORS/origin checks before the call; on a failed upstream
   connection, still return the JSON error shape.
2. Front end: read the response as a stream, parse SSE `data:` lines
   (accumulating `choices[].delta.content`), ignore `:` keep-alive comment lines,
   stop on `data: [DONE]`, and append text to the output with a typing effect.
3. Preserve handling of explicable errors (limits, bad requests) as plain JSON
   messages, and transient/upstream failures as fixed in-character strings — never
   a second model call.

## Do not implement

Do not implement:
- rate limiting / KV, file parsing, sharing/export, or any data source;
- a second model call as a fallback on failure.

## Acceptance criteria

The task is complete when:
- tokens appear incrementally in the UI (typing effect), with no whole-response
  buffering;
- the Worker relays the SSE body without calling `.text()`/`.json()` on it;
- transient/upstream failures show an in-character message; limits and bad
  requests still show a plain message.

## Automated checks

```bash
npm run check
cd worker && npx wrangler deploy --dry-run
```

## Manual verification

Deploy the Worker, open the site, paste a profile, and confirm the roast streams
in progressively rather than appearing all at once.

## Commit and push

If and only if the scope was followed and checks pass, create one commit on
`main` using this file's exact filename (`004_streaming.md`) as the commit
message, then push.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required five-section final report specified in `AGENTS.md`.
