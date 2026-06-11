# Roast a Researcher

*Comedic roast generator for academic profiles — run it on your own record.*

**Live app:** <https://eelkedevries.github.io/roast-a-researcher/>

## What this is

Paste your academic profile, upload a CV, or just search your own name — the app
gathers your public record (ORCID, OpenAlex, Semantic Scholar, DBLP, GitHub, or
your personal website), then streams back a comedic roast grounded strictly in
what the record actually says. Alongside the roast it renders structured
personalia, a de-duplicated publication list, citation metrics, and charts.

It is self-directed comedy: the roast is about a public, professional academic
record, not a verdict on a person. Content rules (no protected characteristics,
no invented allegations, every joke traceable to the supplied text) are enforced
in a fixed server-side prompt at every intensity.

## How it works

Two deployables, deployed separately (see `docs/deployment.md`):

- **Front end** — a Vite + TypeScript static site on GitHub Pages. Handles input
  (search, links, paste, file extraction in the browser), streams the roast, and
  renders the result. Holds no secrets.
- **Worker** — a Cloudflare Worker that holds the OpenRouter API key, carries the
  system prompt and content rules (`worker/roast.md`), enforces per-IP daily
  limits, fetches the public scholarly sources, and relays the model's stream
  as SSE.

## Running locally

```bash
npm ci          # install exact dependencies from the committed lockfile
npm run dev     # start the development server
npm run check   # validate config, type-check and build (the verify command)
npm test        # unit tests (generation helpers + eval harness)
npm run build   # produce the static output in dist/
npm run preview # preview the production build
```

The site is served under the base path `/roast-a-researcher/` to match GitHub
Pages. CI re-runs the build, the verify command, the tests and a secret scan on
every push. See `docs/installation.md` for Worker-side local development.

## Documentation

- `docs/` — user-facing docs: usage, configuration, deployment, privacy,
  spend controls, evaluation, troubleshooting. Start at `docs/README.md`.
- `docs-dev/` — development process docs (prompt workflow, planning, binding
  specification). Start at `docs-dev/agent/how_to_use.md`.

## Development workflow

This repository follows the `eek-a-dev` commit-to-`main` workflow:

- one prompt equals one reviewable unit of work;
- prompt files live in `docs-dev/agent/prompts/`;
- prompt work is committed directly to `main` using the exact prompt filename as
  the commit message;
- do not create feature branches or pull requests unless explicitly instructed;
- run the project verify command and prompt checks before committing.

Key reference documents:

- `docs-dev/reference/primary_authoritative/specification.md` — binding design
  and architecture reference.
- `docs-dev/planning/current_state.md` — current repository state and progress.

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
