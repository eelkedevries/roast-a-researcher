# Installation

How to set up the project locally for development.

## Prerequisites

- Node.js 22 or later (with npm). CI runs on Node 22.

## Install

```bash
git clone git@github.com:eelkedevries/roast-a-researcher.git
cd roast-a-researcher
npm ci
```

`npm ci` installs the exact dependencies from the committed lockfile (use it
rather than `npm install`, which can drift the lockfile).

## Run the front end

```bash
npm run dev      # development server with hot reload
npm run check    # validate worker/roast.md, type-check, and build (the verify command)
npm test         # unit tests (generation helpers + eval harness)
npm run build    # production build into dist/
npm run preview  # serve the production build locally
```

Open the printed local URL in a browser. The local front end talks to the
*deployed* Worker (`workerUrl` in `src/config.ts`), so roasting works without
any local secrets.

## Run the Worker locally (optional)

Only needed when changing Worker code. From `worker/`:

```bash
cp .dev.vars.example .dev.vars   # then fill in the secrets you have
npx wrangler dev
```

`.dev.vars` is git-ignored; see `docs/configuration.md` for what each secret
does. Point `workerUrl` in `src/config.ts` at the printed local address while
testing, and restore it before committing.
