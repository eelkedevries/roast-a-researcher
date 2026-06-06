# Task: Client-side sharing and export

## Goal

Let users copy the roast, download it as text, and download it as an image — all
in the browser, with nothing stored.

## Scope

Implement only client-side sharing/export of a produced roast. Do not implement
adjacent systems or future prompts.

## Required reading

`docs-dev/reference/primary_authoritative/specification.md`: Domain rules
(Sharing and export), Architecture (Data flow and statelessness; Repository
layout — `src/share.ts`).

## Dependencies

`003_worker_proxy` (a roast can be produced). Best run after `004_streaming`.

## Required changes

1. Add `src/share.ts`: copy-to-clipboard, download-as-text, and
   download-as-image (canvas or SVG-to-PNG rendered in the browser).
2. Wire the share controls into the output area, enabled once a roast exists.
3. Use British English in any new copy.

## Do not implement

Do not implement:
- a hosted or shareable URL, or any server-stored roast;
- persistence/accounts, rate limiting, or data sources.

## Acceptance criteria

The task is complete when:
- a produced roast can be copied, downloaded as text, and downloaded as an image,
  entirely client-side;
- nothing is uploaded or stored.

## Automated checks

```bash
npm run check
```

## Manual verification

Produce a roast, then copy it, download it as text, and download it as an image,
confirming each works in the browser.

## Commit and push

If and only if the scope was followed and checks pass, create one commit on
`main` using this file's exact filename (`007_share_export.md`) as the commit
message, then push.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required five-section final report specified in `AGENTS.md`.
