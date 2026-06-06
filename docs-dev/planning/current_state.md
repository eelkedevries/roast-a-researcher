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
- **Structured-source retrieval** (`worker/src/index.ts`) — `/retrieve`
  (`{source,id}` → `{text}`/`{error,reason}`) for GitHub, ORCID and OpenAlex, and
  `/search` (`{source,query}` → `{candidates:[{id,name,affiliation}]}`) for all
  three. ORCID uses the keyless public record (iD format + ISO 7064 checksum
  validation); OpenAlex is keyless (author metrics + works), folding in computed
  citation metrics (`worker/src/metrics.ts`: total/h/g/i10/h5/mean) and an
  open-access + collaboration-geography summary (`worker/src/geo.ts`). Optional
  `ORCID_TOKEN` / `OPENALEX_API_KEY` / `GITHUB_TOKEN` only raise rate limits.
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
- `012_source_input_panel` done: a "Profile links" panel (single-line inputs +
  "+ Add link") validates each link on Roast via the Worker's `/retrieve` —
  tick/cross + reason — and merges retrieved text into the roast. A "search by
  name" box (`017`) queries `/search` and lets the user pick a candidate, which
  pre-fills a link row. Unsupported URLs (Scholar/LinkedIn/etc.) fail with
  guidance to paste.
- ORCID and OpenAlex retrieval are now **keyless** (spec v1.4 corrected the
  earlier "key required" claim after empirical re-verification on 2026-06-06):
  `009_orcid`, `010_openalex`, `016_metrics`, `019_openalex_enrichment`, and
  `017_name_search` (spec v1.5) are all done. Built and type-checked via
  `npm run check` + `wrangler deploy --dry-run`; metrics verified against a hand
  calculation. **Live end-to-end verification against the real APIs is still
  pending** — it could not run in the build container (network allowlist blocks
  `pub.orcid.org` / `api.openalex.org`).
- Remaining prompt: `018_retrieval_cache` (KV cache of `/retrieve`). **Blocked on
  a spec decision** — it conflicts with the locked "Data flow and statelessness"
  rule; the spec must be revised (cache only public-record retrievals, set a TTL,
  bump version) before it can run.
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
- 012_source_input_panel.md (links panel; GitHub live, ORCID/OpenAlex pending 009/010)
- 009_orcid.md (keyless ORCID public-record retrieval; spec v1.4)
- 010_openalex.md (keyless OpenAlex metrics + works retrieval)
- 016_metrics.md (computed citation metrics folded into OpenAlex text)
- 019_openalex_enrichment.md (open-access breakdown + collaboration geography)
- 017_name_search.md (Worker /search + front-end candidate picker; spec v1.5)
