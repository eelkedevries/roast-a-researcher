# Task: Build / CI / supply-chain hardening

## Goal

Tighten reproducibility and supply-chain hygiene of the CI workflows, and add an
editor baseline. No application behaviour change.

## Required changes

1. `.github/workflows/deploy-worker.yml` — replace `npx --yes wrangler@4` with
   `npx wrangler` (4 sites). `npm ci` already installs the lockfile-pinned
   `wrangler@4.98.0`, so the deploy uses the reproducible version instead of
   downloading whatever 4.x is latest.
2. `.github/workflows/check-build.yml` — pin the third-party action to a commit SHA:
   `gitleaks/gitleaks-action@ff98106e4c7b2bc287b24eaf42907196329070c7 # v2.3.9`
   (verified: both `v2` and `v2.3.9` resolve to that SHA). Remove the redundant
   standalone `Build` step — `npm run check` already runs `vite build` and produces
   `dist/` for the public-build check.
3. Add a root `.editorconfig` (utf-8, LF, final newline, trim trailing whitespace,
   2-space indent) mirroring the pre-commit whitespace hooks.

## Acceptance criteria

- Both workflows remain valid YAML; the gitleaks SHA matches `v2`.
- No application/build behaviour change.

## Commit and push

Commit using this file's exact filename, then push.
