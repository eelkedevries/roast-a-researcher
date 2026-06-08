# Task: Consolidate the model, parameters and instructions into one user-facing file

## Goal

A non-technical owner should change the model, the instructions, and every
generation parameter by editing ONE file. Replace `worker/prompt.md`,
`worker/model-config.json` and `worker/model-config.md` with a single
`worker/roast.md`: YAML frontmatter for the knobs (with `#` comments documenting
each), the prompt instructions as prose below. Make the Worker authoritative for
the model so it is no longer chosen in two places.

## Why

- One friendly file instead of three; YAML frontmatter has no JSON braces/commas.
- Model lives in exactly one place (today it must match across `src/config.ts`
  and `wrangler.toml`).
- The Worker ignoring the client's model is more secure than the current allowlist.

## Required reading

`docs-dev/reference/primary_authoritative/specification.md`: Architecture → The
Worker; Data schemas → Configuration.

## Required changes

1. `worker/roast.md` (new). Frontmatter between `---` fences:
   - `model` (OpenRouter slug), `maxOutputTokens` (number), `temperature` and
     `topP` (a number, or the literal `default` to leave unset), `defaultIntensity`
     (number), and `intensity` — a list of `{ label, directive }` (level = position,
     starting at 1). Each key has a `#` comment explaining it.
   - Below the closing `---`: the full prompt body, byte-identical to the current
     `worker/prompt.md` (keep `{{INTENSITY}}` and `{{EXCLUDE}}`).
   - Move the current `directive` strings from `model-config.json` into the
     `intensity` list verbatim. Quote directive strings (they contain colons).
2. Delete `worker/prompt.md`, `worker/model-config.json`, `worker/model-config.md`.
3. Add `yaml` to `dependencies` in `package.json`.
4. `worker/src/index.ts`:
   - Replace the prompt/config imports with `import roastMd from '../roast.md'` and
     `import { parse as parseYaml } from 'yaml'`.
   - Split frontmatter from body (first `---\n … \n---`), `parseYaml` the
     frontmatter; the body becomes `promptTemplate`. `temperature`/`topP` equal to
     `default` (or non-number) parse to `null`.
   - Derive `INTENSITY_LEVELS` from the `intensity` list (level = index + 1),
     `MIN/MAX_INTENSITY`, `DEFAULT_INTENSITY` from `defaultIntensity`,
     `MAX_OUTPUT_TOKENS` from `maxOutputTokens`. `intensityDirective(level)` reads
     `intensity[level - 1].directive`.
   - Use `MODEL_CONFIG.model` as the model. Remove the `MODEL_ALLOWLIST` lookup and
     the `body.model` handling and the `MODEL_ALLOWLIST` field on `Env`. A request
     never chooses the model.
5. `worker/wrangler.toml`: remove the `MODEL_ALLOWLIST` var; keep the `**/*.md` Text
   rule (for `roast.md`) and update its comment; `MAX_INPUT_CHARS` stays.
6. `scripts/check-config.mjs` (new): read `worker/roast.md`, split + `parse` the
   frontmatter, assert `model` is a non-empty string, `maxOutputTokens` a positive
   number, `temperature`/`topP` a number or `default`, `intensity` a non-empty list
   of `{label, directive}`, `defaultIntensity` within range, and the body keeps both
   placeholders. Print a clear message and exit non-zero on any problem.
7. `package.json`: prepend `node scripts/check-config.mjs &&` to the `check` script.
8. `.github/workflows/deploy-worker.yml`: add an `npm ci` step and a
   `node scripts/check-config.mjs` step before `wrangler deploy`, so a bad edit
   aborts the deploy.
9. `src/config.ts`: remove `defaultModel` (field, value, doc comment).
10. `src/ui.ts`: remove `model: config.defaultModel` from the roast request body;
    capture `model` from the streamed chunks where `usage` is read and pass it to
    `renderRunMeta`; `renderRunMeta` omits the "Model …" part when the name is empty.
11. Spec: rewrite the Worker config paragraph and the related Architecture / Data
    schemas / Configuration references (single `roast.md`; Worker authoritative for
    the model; `MODEL_ALLOWLIST` removed) and bump the version.

## Do not implement

- A `/config` endpoint; intensity button labels stay in `src/config.ts`.
- Any change to the prompt wording, default parameter values, or default model.
- Moving `MAX_INPUT_CHARS` / `DAILY_LIMIT` / ORCID vars out of `wrangler.toml`.

## Acceptance criteria

- `npm run check` passes (including the new config check) and
  `cd worker && npx wrangler deploy --dry-run` succeeds.
- Generated prompt and roast behaviour are unchanged from before.
- Editing only `worker/roast.md` changes the model, the parameters, and the
  instructions; a malformed `roast.md` fails `node scripts/check-config.mjs`.

## Automated checks

```bash
npm run check
node scripts/check-config.mjs
cd worker && npx wrangler deploy --dry-run
```

## Manual verification

Change `model` in `roast.md` to another OpenRouter slug, redeploy, confirm the
run-meta shows the new model; revert. Break the YAML and confirm the check fails.

## Commit and push

Commit using this file's exact filename (`045_single_config_file.md`), then push.

## Final report

End with the required five-section final report specified in `AGENTS.md`.
