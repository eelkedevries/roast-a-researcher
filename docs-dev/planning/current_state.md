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
- **Worker proxy** (`worker/`) — Cloudflare Worker proxying a **streaming** roast
  to OpenRouter: CORS preflight + origin pinning, validation (method, content
  type, input size, model allowlist), per-IP daily rate limit (hashed IP in
  Workers KV, plain `429`), a server-side system prompt with the content rules +
  intensity, then `stream: true` relayed as SSE without buffering. Secrets
  `OPENROUTER_API_KEY` + `IP_HASH_SALT`.
- **Front-end extras** — SSE reader with typing effect (`src/ui.ts`); client-side
  file→text extraction (`src/extract.ts`: txt/md/pdf/docx/odt, lazy-loaded);
  client-side share/export (`src/share.ts`: copy, .txt, canvas PNG); `noindex` +
  provider-policy link.

## Key decisions

- Stack: Vite + TypeScript, building to `dist/`.
- Verify command `npm run check` runs `tsc --noEmit && vite build`.
- Site served under base path `/roast-a-researcher/` (GitHub Pages).
- Front-end UI copy and public settings (`WORKER_URL`, `DEFAULT_MODEL`,
  `MAX_INPUT_CHARS`, `DEFAULT_INTENSITY`) live in `src/config.ts`; no secret ever
  ships to the browser.

## In progress / next

- First version complete and live: front end at
  `https://eelkedevries.github.io/roast-a-researcher/`, Worker at
  `https://roast-a-researcher.eelkedevries.workers.dev` (subdomain
  `eelkedevries.workers.dev`, KV `RATE_LIMIT`).
- Structured-source retrieval phase (spec v1.2): `013_upload_list` and
  `011_github` done. GitHub retrieval is live on the Worker's `/retrieve` path
  (`{source,id}` → `{text}` / `{error,reason}`), verified end-to-end.
- Remaining: `009_orcid` and `010_openalex` (Worker `/retrieve` cases) need an
  ORCID read-public client and an OpenAlex API key; `012_source_input_panel` (the
  identifier/URL input UI) depends on those two. No UI exposes `/retrieve` yet.
- Security follow-up: the OpenRouter production key was provided over chat; rotate
  it from the machine (`wrangler secret put OPENROUTER_API_KEY`, typed privately),
  and delete the temporary Cloudflare API token.

## Prompts run

_A running list of completed prompts, newest last. Add the prompt filename as each is run._

- 001_setup.md
- 002_frontend_shell.md
- 003_worker_proxy.md
- 004_streaming.md
- 005_rate_and_caps.md
- 006_input_files.md
- 007_share_export.md
- 008_privacy_and_polish.md
- 013_upload_list.md (run ahead of 009–012, which await API keys)
- 011_github.md (GitHub needs no key; 009/010 still await ORCID/OpenAlex keys)
- 014_input_panel_ux.md (dropzone + chips + segmented intensity)
- 015_output_personalia.md (name in opening; personalia box from a model JSON header)
