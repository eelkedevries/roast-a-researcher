# Task: Front-end shell — static roast UI and config

## Goal

Build the static front-end shell — paste field, intensity control (default
spicy), roast output area, helper and framing/privacy copy, and `src/config.ts`
— on a Vite + TypeScript basis, with no backend call yet.

## Scope

Implement only the static UI shell and its public build config. Do not implement
adjacent systems or future prompts.

## Required reading

`docs-dev/reference/primary_authoritative/specification.md`: Architecture (Two
deployables; Repository layout), Data schemas (Configuration — `src/config.ts`),
Domain rules (Input handling; Roast content, register, and safety — intensity
and framing; Privacy and reputational handling).

## Dependencies

`001_setup.md` (the Vite scaffold and the base path `/roast-a-researcher/`
exist).

## Required changes

1. Put the scaffold on a TypeScript basis to match the spec's "Vite +
   TypeScript" front end: add `tsconfig.json`, rename the entry to
   `src/main.ts`, replace `vite.config.js` with `vite.config.ts` (keeping
   `base: '/roast-a-researcher/'`), and remove the default Vite counter demo
   (`src/counter.js`, demo assets, demo copy). Update `package.json` `check` to
   type-check then build (`tsc --noEmit && vite build`).
2. Build the UI shell in `src/` (e.g. `main.ts` + `ui.ts`): an editable
   paste/textarea field for profile text; an intensity control with three levels
   (`mild`, `medium`, `spicy`) defaulting to `spicy`, presented clearly so it can
   be lowered before generating; a roast output area (empty placeholder for now);
   the input helper lines (LinkedIn Save-to-PDF, Google Scholar, ORCID); the
   self-directed framing copy; and the privacy notice stating that text is sent
   to a model provider. British English throughout.
3. Add `src/config.ts` as the public build config holding `WORKER_URL`,
   `DEFAULT_MODEL`, `MAX_INPUT_CHARS`, `DEFAULT_INTENSITY` (`spicy`), and the UI
   copy / helper / privacy / in-character error strings. Values may be
   placeholders (e.g. an empty `WORKER_URL`); no secret goes here.
4. Set the document `<title>` and the on-page heading to the project; keep
   `index.html` mounting `src/main.ts`.

## Do not implement

Do not implement:
- the Worker, any `fetch`/network call, or wiring to `WORKER_URL`;
- streaming, file upload/extraction, sharing/export, or rate limiting;
- any secret or API key in the front end.

## Acceptance criteria

The task is complete when:
- the page builds and renders the paste field, the intensity control defaulting
  to `spicy`, an empty roast output area, and the helper / framing / privacy copy;
- `src/config.ts` exists with the listed public settings and no secret;
- `npm run build` produces `dist/` under the base path `/roast-a-researcher/`;
- no default Vite demo content remains.

## Automated checks

```bash
npm run check                       # tsc --noEmit && vite build
bash scripts/check-public-build.sh dist
```

## Manual verification

Run `npm run dev` (or `npm run preview` of the build) and confirm the shell
renders: the paste field, the three-level intensity control showing `spicy`
selected by default, the output area, and the helper, framing, and privacy copy.
No network request is made.

## Commit and push

If and only if the scope was followed and checks pass, create one commit on
`main` using this file's exact filename (`002_frontend_shell.md`) as the commit
message, then push.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required five-section final report specified in `AGENTS.md`.
