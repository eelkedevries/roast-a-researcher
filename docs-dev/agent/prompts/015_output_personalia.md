# Task: Personalia box and the researcher's name in the opening

## Goal

Open the roast with the researcher's name, and show a personalia box (name,
current affiliation, and the input sources used) above it; name and affiliation
come from a model-emitted JSON header.

## Scope

Implement only the Worker system-prompt change and the front-end header parsing
plus the personalia box. Do not add data sources or a second model call.

## Required reading

`docs-dev/reference/primary_authoritative/specification.md`: Domain rules (Roast
output presentation; Roast content, register, and safety), Data schemas (Worker →
front end), Architecture (the streaming relay).

## Dependencies

`004_streaming` (SSE reader) and `003_worker_proxy`.

## Required changes

1. Worker: update the system prompt so the model emits, as the very first line, a
   single-line JSON header `{"name": …, "affiliation": …}` (use `null` where it
   cannot tell), then a blank line, then the roast — and the roast's opening
   sentence names the researcher. The streaming relay is unchanged.
2. Front end: parse the first line of the stream as the header and fill the
   personalia box (name, affiliation); stream the remainder as the roast text, and
   never display the raw header. If the header is missing or unparseable, show
   "unknown" for the fields and still render the roast.
3. Add a personalia box above the output showing the researcher's name, current
   affiliation, and the input sources used for this roast — tracked by the front
   end (pasted text, each uploaded filename, each retrieved source). Reveal it
   with the roast.

## Do not implement

Do not implement:
- a second model call (for extraction or anything else);
- new data sources or persistence.

## Acceptance criteria

The task is complete when:
- the roast's first sentence contains the researcher's name;
- the personalia box shows name + affiliation (or "unknown") and the input
  sources used;
- the raw JSON header is never visible in the output.

## Automated checks

```bash
npm run check
cd worker && npx wrangler deploy --dry-run
```

## Manual verification

Deploy; roast a profile; confirm the opening sentence names the researcher, the
box shows name/affiliation/sources, and no JSON header leaks into the roast.

## Commit and push

If and only if the scope was followed and checks pass, create one commit on
`main` using this file's exact filename (`015_output_personalia.md`) as the
commit message, then push.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required five-section final report specified in `AGENTS.md`.
