# Deployment

Roast a Researcher has two deployables: a static front end served from
eelkedevries.com, and a Cloudflare Worker that holds the OpenRouter key and
proxies the model call. Deploy them separately.

## Front end → eelkedevries.com

The front end is served at <https://eelkedevries.com/roast-a-researcher/> — a
subfolder of the eelkedevries.com document root, on the same host as the main
site. Because that host serves the files (not GitHub Pages), the page remains
publicly available even while this repository is private.

1. One-time setup: add the deploy secrets under **Settings → Secrets and
   variables → Actions**, with the same values as the eelkedevries.com
   repository: `SSH_PRIVATE_KEY`, `SSH_KEY_PASSPHRASE` (optional),
   `SSH_KNOWN_HOSTS` (optional — the workflow falls back to a run-time
   `ssh-keyscan`), `REMOTE_HOST`, `REMOTE_USER`, `REMOTE_PORT`,
   `REMOTE_PATH_PRODUCTION`. Easiest is
   `bash scripts/setup-deploy-secrets.sh`, run locally on the machine that
   holds the deploy key: it prompts for the values once and sets them all via
   the GitHub CLI (secrets are write-only, so they cannot be copied between
   repositories automatically).
2. Deploys are automatic: every push to `main` that touches the front end
   (`src/**`, `public/**`, `index.html`, `vite.config.ts`, the lockfile) runs
   the `deploy-site.yml` workflow. It can also be run manually from
   **Actions → "Deploy Site" → Run workflow**.
3. The workflow builds `dist/` (`npm ci && npm run build`), runs the
   public-build safety check, and rsyncs the output over SSH into
   `<docroot>/roast-a-researcher/` (the matching base path is set in
   `vite.config.ts`).

The eelkedevries.com repository's own deploy protects `/roast-a-researcher/`
from its `rsync --delete` (`scripts/deploy.sh` there), so the two deploys never
interfere.

The front end holds no secret. Its only knowledge of the backend is `workerUrl`
in `src/config.ts`, a committed value set at build time.

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
   - `npx wrangler secret put OPENALEX_API_KEY` — the free OpenAlex key, required
     for all OpenAlex features (anonymous requests are rejected with HTTP 429)
   - optional, for "Log in with ORCID": `npx wrangler secret put ORCID_CLIENT_SECRET`
     and `npx wrangler secret put SESSION_SECRET` (login is disabled when either is unset)
4. Deploy: `npx wrangler deploy`.

Pushes to `main` that touch `worker/**` also deploy automatically via the
`deploy-worker.yml` workflow (it validates `worker/roast.md` first and re-applies
the CI-managed secrets). The manual route above is only needed for first-time
setup or when CI is unavailable.

After deploying the Worker, set `workerUrl` in `src/config.ts` to the Worker URL
and redeploy the front end so the page calls the live Worker.

## CORS

`ALLOW_ORIGIN` in `worker/wrangler.toml` must be the exact origin the app is
served from (`https://eelkedevries.com`, scheme + host, no path). The Worker
rejects any other origin.
