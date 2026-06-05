# Current state

Living, high-level orientation for the project: what exists now, key architectural decisions, and what is in progress. Read it at the start of a session to orient quickly.

Update it only for genuinely useful orientation — a new system, an architectural decision — not after routine commits. A stale or bloated state file is worse than none.

This file records what *is* (current reality). The binding design canon is `docs-dev/reference/primary_authoritative/`; when the two conflict, the canon wins and the gap is work still to be done.

## Systems

- **Build/dev scaffold** — Vite + TypeScript static site, building to `dist/`.
- **Front-end shell** — static roast UI (`src/main.ts`, `src/ui.ts`): paste field
  with live character count, three-level intensity control (default `spicy`),
  empty roast output area, profile-source helper lines, self-directed framing,
  and the privacy notice. Public build config in `src/config.ts`. No backend
  call yet (wired in `003_worker_proxy`).

## Key decisions

- Stack: Vite + TypeScript, building to `dist/`.
- Verify command `npm run check` runs `tsc --noEmit && vite build`.
- Site served under base path `/roast-a-researcher/` (GitHub Pages).
- Front-end UI copy and public settings (`WORKER_URL`, `DEFAULT_MODEL`,
  `MAX_INPUT_CHARS`, `DEFAULT_INTENSITY`) live in `src/config.ts`; no secret ever
  ships to the browser.

## In progress / next

- `003_worker_proxy` drafted and approved; not run. Needs an OpenRouter account +
  key and a Cloudflare account before it can deploy and verify end to end.

## Prompts run

_A running list of completed prompts, newest last. Add the prompt filename as each is run._

- 001_setup.md
- 002_frontend_shell.md
