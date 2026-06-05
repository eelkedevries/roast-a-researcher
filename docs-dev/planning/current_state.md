# Current state

Living, high-level orientation for the project: what exists now, key architectural decisions, and what is in progress. Read it at the start of a session to orient quickly.

Update it only for genuinely useful orientation — a new system, an architectural decision — not after routine commits. A stale or bloated state file is worse than none.

This file records what *is* (current reality). The binding design canon is `docs-dev/reference/primary_authoritative/`; when the two conflict, the canon wins and the gap is work still to be done.

## Systems

- **Build/dev scaffold** — Vite vanilla (JavaScript) static site. Default template content only; no application features yet.

## Key decisions

- Stack: Vite vanilla JS, building to `dist/`.
- Verify command `npm run check` runs `vite build`.
- Site served under base path `/roast-a-researcher/` (GitHub Pages).

## In progress / next

_Nothing in progress yet._

## Prompts run

_A running list of completed prompts, newest last. Add the prompt filename as each is run._

- 001_setup.md
