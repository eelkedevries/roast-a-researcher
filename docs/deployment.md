# Deployment

Roast a Researcher has two deployables: a static front end on GitHub Pages, and a
Cloudflare Worker that holds the OpenRouter key and proxies the model call. Deploy
them separately.

## Front end → GitHub Pages

1. In the repository: **Settings → Pages → Build and deployment → Source:
   "GitHub Actions"**.
2. Run the deploy workflow: **Actions → "Deploy to GitHub Pages" → Run workflow**,
   or from the CLI `gh workflow run deploy-pages.yml`.
3. The workflow builds `dist/` (`npm ci && npm run build`), runs the public-build
   safety check, and publishes. The site appears at
   `https://eelkedevries.github.io/roast-a-researcher/` (the base path is set in
   `vite.config.ts`).

The front end holds no secret. Its only knowledge of the backend is `WORKER_URL`
in `src/config.ts`, set at build time.

## Worker → Cloudflare

Prerequisites: a Cloudflare account and `wrangler` authenticated — either
`wrangler login` (browser OAuth, run at the machine) or a `CLOUDFLARE_API_TOKEN`
scoped to "Edit Cloudflare Workers".

From `worker/`:

1. **First time only**, register a `workers.dev` subdomain (dashboard → Workers
   onboarding, or `wrangler` will prompt). The Worker is then served at
   `roast-a-researcher.<subdomain>.workers.dev`.
2. Create the rate-limit KV namespace and bind it (already recorded in
   `wrangler.toml`):
   `npx wrangler kv namespace create RATE_LIMIT`.
3. Set the secrets:
   - `npx wrangler secret put OPENROUTER_API_KEY`
   - `npx wrangler secret put IP_HASH_SALT` (any long random string)
4. Deploy: `npx wrangler deploy`.

After deploying the Worker, set `WORKER_URL` in `src/config.ts` to the Worker URL
and redeploy the front end so the page calls the live Worker.

## CORS

`ALLOW_ORIGIN` in `worker/wrangler.toml` must be the exact Pages origin
(`https://eelkedevries.github.io`, scheme + host, no path). The Worker rejects any
other origin.
