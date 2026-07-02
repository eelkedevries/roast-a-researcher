# Troubleshooting

Common failures, what they mean, and how to fix them.

## Using the app

**"Daily roast limit reached" / "Daily lookup limit reached"** — the per-IP
daily caps (`DAILY_LIMIT` roasts, `RETRIEVE_DAILY_LIMIT` lookups) were hit.
They reset at midnight UTC. The owner can raise them in
`worker/wrangler.toml` and redeploy (see `spend-and-limits.md`).

**An in-character error ("The model has stepped out for a sabbatical…")** —
the model call failed upstream. Usually transient: try again. If it persists,
the OpenRouter credit balance or per-key daily budget may be exhausted
(see `spend-and-limits.md`), or the configured model slug in `worker/roast.md`
is no longer valid.

**A personal website fails with "No readable text found" or "paste instead"** —
the site is rendered by JavaScript or behind a login (LinkedIn and Google
Scholar profiles typically are). The crawler only reads server-rendered HTML.
Paste the text, or upload a CV instead.

**A PDF reports "No text found — this looks like a scanned or image-only
PDF"** — the PDF has no text layer. Use the offered **Try OCR** button (runs in
your browser; the first run downloads the OCR engine), or paste the text.

**The stats card and charts are missing** — they only appear for OpenAlex-backed
records (an OpenAlex link, or an ORCID that resolves to one). If the Worker logs
show OpenAlex HTTP 429, the free `OPENALEX_API_KEY` secret is missing or its
daily budget is spent (see `configuration.md`).

**"Log in with ORCID" bounces back with an error** — login is disabled until
`ORCID_CLIENT_ID`, `ORCID_CLIENT_SECRET` and `SESSION_SECRET` are configured on
the Worker, and the registered redirect URI must exactly match
`ORCID_REDIRECT_URI` (see `configuration.md`).

**"That is longer than 40000 characters"** — the combined input (pasted text +
documents + retrieved sources) exceeds the cap. Remove a source or trim the
pasted text.

## Developing and deploying

**Blank page after a deploy** — almost always a base-path problem. The app is
served from a subfolder, so `base` in `vite.config.ts` must match it
(`/roast-a-researcher/`). Check the browser console for asset 404s.

**Browser console shows CORS / `forbidden_origin` errors** — the Worker pins
requests to one origin. `ALLOW_ORIGIN` in `worker/wrangler.toml` must be the
exact origin the app is served from (`https://eelkedevries.com` — scheme +
host, no path, no trailing slash).

**`npm run check` fails on `worker/roast.md`** — the YAML frontmatter is
malformed or a placeholder is missing; the error message lists exactly what.
Fix the file rather than the validator (`scripts/check-config.mjs`).

**Development server will not start** — confirm the Node version (22+), then
remove `node_modules/` and re-run `npm ci`.
