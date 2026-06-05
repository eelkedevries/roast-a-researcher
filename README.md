# Roast a Researcher

*Comedic roast generator for academic profiles*

## What this is

Comedic roast generator for academic profiles

This project is built with the **node** stack.

## Running locally

```bash
npm ci          # install exact dependencies from the committed lockfile
npm run dev     # start the development server
npm run check   # type-check and build (the verify command)
npm run build   # produce the static output in dist/
npm run preview # preview the production build
```

## How it builds and deploys

The build tool compiles the source into `dist/`. Installs are reproducible from the committed lockfile (`npm ci`, not `npm install`). The site is served under the base path `/roast-a-researcher/` to match GitHub Pages deployment.

CI re-runs the build, the verify command, and a secret scan on every push, so a
broken or leaky commit is caught automatically.

## Development workflow

This repository follows the `eek-a-dev` commit-to-`main` workflow:

- one prompt equals one reviewable unit of work;
- prompt files live in `docs-dev/agent/prompts/`;
- prompt work is committed directly to `main` using the exact prompt filename as
  the commit message;
- do not create feature branches or pull requests unless explicitly instructed;
- run the project verify command and prompt checks before committing.

Start with `docs-dev/agent/how_to_use.md` for the daily workflow.

## Reference documents

- `docs-dev/reference/primary_authoritative/specification.md` — binding design and architecture reference.
- `docs-dev/reference/secondary_background/overview.md` — non-binding product overview.
- `docs-dev/planning/current_state.md` — current repository state and implemented progress.

## Local safety hooks

Optional but recommended after cloning locally:

```bash
pre-commit install
```

This enables local checks for large files, private keys, `.env` files, prompt
numbering, and basic formatting before commits.

## Licence status

No licence has been granted yet. All rights are reserved unless a `LICENSE` file
is added later.

## Public repository note

This repository is public. Do not commit secrets, credentials, private notes,
customer material, or proprietary material. `docs-dev/` is publicly visible but
is never included in the deployed build output.
