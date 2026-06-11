# Current state

Living, high-level orientation for the project: what exists now, key architectural decisions, and what is in progress. Read it at the start of a session to orient quickly.

Update it only for genuinely useful orientation — a new system, an architectural decision — not after routine commits. A stale or bloated state file is worse than none.

This file records what *is* (current reality). The binding design canon is `docs-dev/reference/primary_authoritative/`; when the two conflict, the canon wins and the gap is work still to be done.

## Systems

- **Build/dev scaffold** — Vite + TypeScript static site, building to `dist/`.
- **Front-end shell** — `src/ui.ts` renders the **"Focused Console" UI (Direction A
  redesign)**: two cards — a numbered 2-step **Roast input** (a search-by-name hero
  as the primary input + a collapsible "manual" `<details>` with three groups: a
  dedicated **Personal website** field (forced `website` source = full same-site
  crawl, "+ Add website" for more), **Profile links** (ORCID/OpenAlex/GitHub/SS/DBLP),
  and **paste text or upload documents** (PDF/Word/ODT/txt/md via `src/extract.ts`;
  extracted **in memory** with a ✓ + char count, fed to the roast without filling
  the paste box — `documentTexts` WeakMap / `collectDocumentTexts`))
  and a **Roast output** card. The output is now **four sections**
  (`036`, spec v1.22): **Personalia** (name, position, current/previous
  affiliations, research domain, focus keywords, education + Profiles/Grants/Awards
  subsections), **Profile** (the streamed roast with a caret), **Papers** (main
  papers with cite counts), and **The numbers** (stats card + charts). Personalia +
  Papers are **model-extracted**: the roast model emits a JSON block then a
  `===ROAST===` marker then the roast; the FE buffers to the marker, parses the
  JSON (`renderResult`), then streams the roast. Profiles are built from the user's
  link rows; empty fields/sections are omitted. The JSON block is parsed by a
  brace-balanced, marker-optional extractor (`extractLeadingJson`) so personalia
  still render if the model drops the `===ROAST===` marker. A **run-metadata** line
  under the roast shows elapsed time, input size, model, token usage and dollar cost
  (from OpenRouter `usage: { include: true }` in the final stream chunk). **Papers
  are merged across sources** (`038`): each structured retrieval returns a
  `papers[]` (ORCID works+DOIs, a ~50-work OpenAlex list, Semantic Scholar papers,
  DBLP publications); the FE `mergePapers` de-dupes by DOI/normalised title, keeps
  the max citations, and renders the combined list (overriding model papers when
  any structured papers exist). OpenAlex paper fetch raised to 200; each paper has
  a **"not mine" checkbox** (OpenAlex mis-attributes some) — marking papers and
  pressing **Re-roast** sends an `exclude` list that the Worker injects into the
  **system prompt** (trusted channel, not the untrusted profile) to ignore them. Default
  model is `google/gemini-2.5-flash`; the roast length is **dynamic** — it scales
  with how much genuinely funny, on-target material there is (a few sentences up to
  ~600 words), never padded — so `MAX_OUTPUT_TOKENS` is 1500.
  Also: **"Try a sample"** (zero-cost canned demo, `src/demo.ts`, no model call),
  **"Download data"** (`.md` export) beside **Roast me**, and a **3-level intensity
  control** (Keep it factual / Don’t hold back / Show no mercy; default the
  strongest) shown both before and, after a roast, in a post-roast panel (change
  intensity + re-roast, and "Inspect papers used"). A **Format** selector (Straight
  roast + 6 comedic presets) sits in the settings. Warm-palette CSS + Plus Jakarta
  Sans / Space Mono in `src/style.css`; fonts via `@import`. The roast POSTs
  `{ profile, intensity, format, regenerate, exclude }` to the Worker (the model is
  fixed server-side in `roast.md`) and streams SSE, or shows an in-character error.
- **Worker proxy** (`worker/`) — Cloudflare Worker proxying a **streaming** roast
  to OpenRouter: CORS preflight + origin pinning, validation (method, content
  type, input size), per-IP daily rate limit (hashed IP in
  Workers KV, plain `429`, `DAILY_LIMIT`=50), a server-side system prompt with the
  content rules + intensity, then `stream: true` relayed as SSE without buffering.
  Secrets `OPENROUTER_API_KEY` + `IP_HASH_SALT` (+ free `OPENALEX_API_KEY`).
- **Humour controls + evaluation** — config consolidated into the single
  `worker/roast.md` (`043`–`045`); the Worker hardened with per-IP retrieve throttle,
  SSRF/redirect re-checks, fetch timeouts and a streaming size-cap (`049`, `051`).
  **Roast humour** is tuned via opt-in `roast.md` config (all defaulting to the
  current single-model, straight-roast behaviour): named `models` buckets +
  per-intensity/regenerate `routing` with a fallback retry; comedic `formats` presets
  (Reviewer 2, desk-rejection, tenure-denial, grant-panel, conference-intro,
  performance-review); experimental `exemplars` (off by default); and a revised
  single-angle comic prompt. Pure helpers in `worker/src/generation.mjs` are shared by
  the Worker, the **`eval/` harness** (multi-candidate generation across conditions on
  synthetic profiles + a blinded human pairwise `compare.html`, never an LLM judge),
  and unit tests (`npm test`). Verified model prices live in `eval/prices.json` /
  `docs/spend-and-limits.md`. See `docs/evaluation.md`.
- **Structured-source retrieval** (`worker/src/index.ts`) — `/retrieve`
  (`{source,id,fresh?}` → `{text,stats?,charts?}` / `{error,reason}`) and `/search`
  (`{source,query}` → `{candidates:[{id,name,affiliation}]}`) for **GitHub, ORCID,
  OpenAlex, Semantic Scholar, DBLP**. ORCID = keyless public record (iD + ISO 7064
  checksum) incl. grants/awards, and **auto-resolves the matching OpenAlex** so an
  ORCID alone yields metrics/charts. OpenAlex = author metrics + works + computed
  metrics (`metrics.ts`: total/h/g/i10/h5/mean), FWCI, p-index, open-access +
  collaboration geography (`geo.ts`), named co-authors, trend analysis
  (`trends.ts`), chart series, and Semantic Scholar TLDR/influential-citation
  enrichment by DOI; **requires the free `OPENALEX_API_KEY`**. DBLP person `.xml`
  parsed with string ops. Retrievals cached in KV for 24h (`rc:` prefix;
  `RETRIEVE_CACHE_TTL`). arXiv/PubMed were built then removed (namesake risk).
- **Front-end extras** — SSE reader with typing effect (`src/ui.ts`); client-side
  file→text extraction (`src/extract.ts`: txt/md/pdf/docx/odt, lazy-loaded) with an
  **opt-in scanned-PDF OCR fallback** (`ocrPdf`, tesseract.js, lazy); client-side
  share/export (`src/share.ts`: copy, .txt, canvas PNG); SVG charts (`src/charts.ts`);
  `noindex` + provider-policy link.

## Key decisions

- Stack: Vite + TypeScript, building to `dist/`.
- Verify command `npm run check` runs the `roast.md` config check, `tsc --noEmit`
  for both the front end and the Worker (`worker/tsconfig.json`), and `vite build`.
- Site served under base path `/roast-a-researcher/` (GitHub Pages).
- Front-end UI copy and public settings (`WORKER_URL`, `DEFAULT_MODEL`,
  `MAX_INPUT_CHARS`, `DEFAULT_INTENSITY`) live in `src/config.ts`; no secret ever
  ships to the browser.

## In progress / next

- **ORCID login → verified badge (`033`–`035`, spec v1.20)** — an **optional**,
  **session-only** "Log in with ORCID" feature. Worker runs the OAuth
  authorization-code flow with the minimal `/authenticate` scope (returns only the
  iD; no private data, no database): `/auth/orcid/login` → ORCID → `/auth/orcid/callback`
  mints a short-lived **HMAC-signed token** (`SESSION_SECRET`) handed back in a URL
  fragment; `/auth/me` validates it. The front end (`src/auth.ts`) stores the token
  in `localStorage` and sends it as a `Bearer` header (no cookie — the Pages and
  Worker origins differ, so a session cookie would be a blocked third-party cookie).
  A header control shows login/logout state; when the logged-in iD matches a
  selected ORCID link row, the personalia Name row shows a cosmetic "✓ ORCID-verified"
  badge. New non-secret vars (`ORCID_OAUTH_BASE` defaulting to **sandbox**,
  `ORCID_CLIENT_ID`, `ORCID_REDIRECT_URI`, `APP_URL`) + two secrets
  (`ORCID_CLIENT_SECRET`, `SESSION_SECRET`); login is disabled when unset.
  Built + type-checked (`npm run check`, `wrangler deploy --dry-run`). **Human
  actions pending:** register the ORCID OAuth app, set the two Cloudflare secrets
  and `ORCID_CLIENT_ID`, then verify the live round-trip against ORCID sandbox
  (the build container cannot reach `orcid.org`).
- **Front end redesigned to "Focused Console" (Direction A)** from a design handoff,
  shipped as `feat:` commits (not numbered prompts); `src/ui.ts` + `src/style.css`
  rewritten, `src/charts.ts` gained a 5th "Top venues" chart, `032_pdf_ocr` added
  the OCR fallback. Key UX: search-by-name is primary; results are a **single list
  ranked by name similarity** (full-name matches shown; the rest under one "See more
  options if this may not be you" foldout); ticking a result auto-adds a link row
  and auto-retrieves with inline ✓/✗ + a "View record" link; manual links/paste are
  in a `<details>`. **Download data** sits beside **Roast me**; pressing either
  collapses results to the selected entries. Personalia "Sources" shows platform
  names. When both an ORCID and the same OpenAlex are selected, the redundant
  OpenAlex is **de-duplicated and not re-fetched** (ORCID auto-embeds it; non-OpenAlex
  sources fetched first, standalone OpenAlex skipped if already covered).
  **The spec's UI/presentation sections predate this redesign — treat the code as
  truth for the front-end UI; a spec refresh of those sections is pending.**
- First version complete and live: front end at
  `https://eelkedevries.github.io/roast-a-researcher/`, Worker at
  `https://roast-a-researcher.eelkedevries.workers.dev` (subdomain
  `eelkedevries.workers.dev`, KV `RATE_LIMIT`).
- `012_source_input_panel` done: a "Profile links" panel (single-line inputs +
  "+ Add link") validates each link on Roast via the Worker's `/retrieve` —
  tick/cross + reason — and merges retrieved text into the roast. A "search by
  name" box (`017`) queries `/search` and lets the user pick a candidate, which
  pre-fills a link row. **Any non-structured http(s) URL now resolves to the
  `website` source** (`036`): the Worker fetches it and flattens the HTML to
  readable text, guarded by http(s)-only / 8s timeout / size cap / HTML
  content-type / blocked-host (SSRF) checks. Reverses the earlier no-scraping
  stance (spec v1.21). For a **personal site the Worker now crawls the whole site**
  (v1.26): from the given page + site root it follows same-host links (CV, media,
  …) and combines their text, bounded by page/char caps and a time deadline. Static
  personal/university pages work well; JS-rendered or login-walled sites (LinkedIn,
  Scholar) often return little and fail with a "paste instead" reason.
- **OpenAlex now needs a free API key** (usage-based pricing, re-verified
  2026-06-07: anonymous = $0 budget → HTTP 429; free key = $1/day, single-ID
  lookups $0). Set `OPENALEX_API_KEY` (Cloudflare secret) for all OpenAlex
  features. ORCID/GitHub stay free; ORCID is keyless. The earlier v1.4 "keyless"
  claim was a transient OpenAlex state and is corrected in spec v1.11.
- ORCID and OpenAlex retrieval (note OpenAlex key requirement above):
  `009_orcid`, `010_openalex`, `016_metrics`, `019_openalex_enrichment`, and
  `017_name_search` (spec v1.5) are all done. Built and type-checked via
  `npm run check` + `wrangler deploy --dry-run`; metrics verified against a hand
  calculation. **Live end-to-end verification against the real APIs is still
  pending** — it could not run in the build container (network allowlist blocks
  `pub.orcid.org` / `api.openalex.org`).
- Enrichment batch `020`–`027` done (ScholarFolio-inspired, all free/keyless):
  ORCID grants+awards (`020`); OpenAlex FWCI + journal citedness (`021`), p-index
  (`022`), Semantic Scholar TLDR + influential citations by DOI (`023`, spec v1.8),
  named frequent co-authors (`024`); structured chart data in `/retrieve` (`025`),
  trend analysis folded into the roast text (`026`, `worker/src/trends.ts`), and
  client-side SVG charts below the roast (`027`, `src/charts.ts`, spec v1.9 — adds
  visualisation to scope). The OpenAlex `/retrieve` response is now
  `{ text, stats, charts }`. All verified via `npm run check` + `wrangler
  deploy --dry-run`; live API field availability still to confirm in-browser.
- New sources `028`–`031` done (all free): **Semantic Scholar** (author search +
  retrieval: papers/citations/h-index + top papers w/ TLDRs; spec v1.12) and
  **DBLP** (CS bibliography; pid-anchored; person `.xml` parsed with string ops;
  spec v1.13) are ID-anchored. **arXiv** and **PubMed** are **name-matched** (no
  author IDs) — added under a new spec "name-matched provision" (v1.14): results
  labelled "may include namesakes", explicit selection, PubMed ORCID-anchored
  (`[auid]`) when an ORCID is given. Search now spans GitHub, ORCID, OpenAlex,
  Semantic Scholar, DBLP. **arXiv and PubMed were implemented then disabled
  (spec v1.15, 2026-06-07) — namesake risk; their code path is removed.**
- `018_retrieval_cache` **done** (spec v1.16): public-record retrievals
  (ORCID/OpenAlex/GitHub/Semantic Scholar/DBLP) are cached in KV (`rc:` prefix,
  reusing the `RATE_LIMIT` namespace) with a short TTL (`RETRIEVE_CACHE_TTL`,
  default 24h). User text and the roast are never cached; errors not cached. This
  cuts OpenAlex budget burn and rate-limit 429s on repeat roasts. The locked
  statelessness decision was deliberately relaxed for public records only. Per-roast
  OpenAlex calls were also trimmed (dedupe group_by; p-index 8→3).
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
- 020_orcid_grants_awards.md (ORCID fundings + distinctions)
- 021_openalex_field_metrics.md (FWCI + mean journal citedness)
- 022_openalex_pindex.md (journal-year citation percentile)
- 023_semantic_scholar.md (keyless TLDR + influential citations by DOI; spec v1.8)
- 024_named_coauthors.md (frequent named co-authors from authorships)
- 025_chart_data.md (structured chart series in /retrieve)
- 026_trend_analysis.md (factual trend block in the roast text)
- 027_charts.md (client-side SVG charts; visualisation now in scope; spec v1.9)
- 028_semanticscholar_source.md (Semantic Scholar author search + retrieval; spec v1.12)
- 029_dblp.md (DBLP CS bibliography source; spec v1.13)
- 030_arxiv.md + 031_pubmed.md (name-matched preprint/biomedical sources; spec v1.14; later disabled, v1.15)
- 032_pdf_ocr.md (opt-in scanned-PDF OCR via tesseract.js)
- Front-end "Focused Console" redesign + UX refinements (feat commits, not prompts):
  similarity-ranked single search list, auto-add/auto-retrieve on select, Download
  data button, collapse-to-selected, OpenAlex de-dup + skip-redundant-fetch.
