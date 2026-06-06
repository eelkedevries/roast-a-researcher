# Task: Privacy, noindex, and deployment docs

## Goal

Finalise the privacy disclosure and reputational handling, mark the page
`noindex`, confirm in-character transient-error and input-size handling, and
write the deployment and configuration docs.

## Scope

Implement only the privacy/polish items and the user-facing docs. Do not
implement adjacent systems or future prompts.

## Required reading

`docs-dev/reference/primary_authoritative/specification.md`: Domain rules
(Privacy and reputational handling; Roast content; Error and failure handling),
Architecture, UI and platform requirements (Deployment), Data schemas
(Configuration).

## Dependencies

`003_worker_proxy` and the front end (`002_frontend_shell`). Best run after
`004`–`007`.

## Required changes

1. Privacy: state which provider the text reaches (via OpenRouter) and link the
   provider's data policy; ensure the on-page privacy notice is clear and
   accurate.
2. Add `<meta name="robots" content="noindex">` to the page, and keep it off any
   professional-domain index path.
3. Confirm transient/upstream failures show fixed in-character strings (never a
   second model call) while limits and bad requests show plain messages; confirm
   client-side input-size handling mirrors `MAX_INPUT_CHARS`.
4. Write `docs/` pages — deployment (front end → GitHub Pages; Worker →
   `wrangler deploy` + secrets + the `workers.dev` subdomain), configuration
   (`src/config.ts` and `wrangler.toml` `[vars]`), and privacy — based on the
   actual deployed setup (GitHub Pages at
   `https://eelkedevries.github.io/roast-a-researcher/` and the Worker at
   `roast-a-researcher.eelkedevries.workers.dev`).

## Do not implement

Do not implement:
- analytics, hosted roast pages, accounts, or any data source.

## Acceptance criteria

The task is complete when:
- the deployed page carries `noindex` and the privacy notice names the provider
  and links its policy;
- a fresh deploy works from the docs alone; transient failures show an
  in-character message.

## Automated checks

```bash
npm run check
bash scripts/check-public-build.sh dist
```

## Manual verification

Load the deployed page, view source for `noindex`, read the privacy notice, and
follow the deployment doc end to end on a clean checkout.

## Commit and push

If and only if the scope was followed and checks pass, create one commit on
`main` using this file's exact filename (`008_privacy_and_polish.md`) as the
commit message, then push.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required five-section final report specified in `AGENTS.md`.
