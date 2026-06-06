# Current state

Living, high-level orientation for the project: what exists now, key architectural decisions, and what is in progress. Read it at the start of a session to orient quickly.

Update it only for genuinely useful orientation — a new system, an architectural decision — not after routine commits. A stale or bloated state file is worse than none.

This file records what *is* (current reality). The binding design canon is `docs-dev/reference/primary_authoritative/`; when the two conflict, the canon wins and the gap is work still to be done.

## Systems

- **Build/dev scaffold** — Vite + TypeScript static site, building to `dist/`.
- **Front-end shell** — static roast UI (`src/main.ts`, `src/ui.ts`): paste field
  with live character count, three-level intensity control (default `spicy`),
  roast output area, profile-source helper lines, self-directed framing, and the
  privacy notice. Public build config in `src/config.ts`. The roast button POSTs
  `{ profile, intensity, model }` to `WORKER_URL` and renders the roast or an
  in-character error.
- **Worker proxy** (`worker/`) — Cloudflare Worker that proxies a non-streaming
  roast to OpenRouter: CORS preflight + origin pinning to the Pages origin,
  validation (method, content type, input size, model allowlist), a server-side
  system prompt carrying the content rules + intensity, then a non-streaming
  OpenRouter call returning `{ roast }`. Secret `OPENROUTER_API_KEY` via
  `wrangler secret put` / local `worker/.dev.vars` (git-ignored).

## Key decisions

- Stack: Vite + TypeScript, building to `dist/`.
- Verify command `npm run check` runs `tsc --noEmit && vite build`.
- Site served under base path `/roast-a-researcher/` (GitHub Pages).
- Front-end UI copy and public settings (`WORKER_URL`, `DEFAULT_MODEL`,
  `MAX_INPUT_CHARS`, `DEFAULT_INTENSITY`) live in `src/config.ts`; no secret ever
  ships to the browser.

## In progress / next

- `003_worker_proxy` complete and verified end-to-end on the **deployed Worker**
  `https://roast-a-researcher.eelkedevries.workers.dev`: live roast 200; forged
  origin 403, oversized 413, bad model 400. `WORKER_URL` wired in `src/config.ts`.
- Worker subdomain registered: `eelkedevries.workers.dev`. Secret
  `OPENROUTER_API_KEY` set via `wrangler secret put`.
- Next: deploy the front end to GitHub Pages (Settings → Pages → Source: GitHub
  Actions, then run `deploy-pages.yml`) so the public site is live; then
  `004_streaming`.
- Security follow-up: the production OpenRouter key was provided over chat; rotate
  it from the machine (`wrangler secret put OPENROUTER_API_KEY`, typed privately).

## Prompts run

_A running list of completed prompts, newest last. Add the prompt filename as each is run._

- 001_setup.md
- 002_frontend_shell.md
- 003_worker_proxy.md (code; deploy pending)
