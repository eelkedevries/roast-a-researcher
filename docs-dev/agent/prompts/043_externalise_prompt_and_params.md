# Task: Move the LLM prompt and model parameters into user-facing Markdown files

## Goal

The system prompt and the generation knobs were hardcoded in
`worker/src/index.ts`. Extract them into two user-facing Markdown files the owner
can edit without touching code: one with the prompt instructions, one with the
adjustable model parameters (and add `temperature` / `top_p` as new knobs). The
files are bundled into the Worker at build time, so the prompt stays server-side
(never exposed to the browser).

## Scope

Worker only. New `worker/prompt.md` and `worker/model-config.md`, bundled as Text
modules via a `wrangler.toml` rule and imported by `worker/src/index.ts`. The
prompt content is preserved byte-for-byte. No front-end change.

## Required reading

`docs-dev/reference/primary_authoritative/specification.md`: Architecture → The
Worker.

## Required changes

1. `worker/prompt.md` — the full system prompt as Markdown, with `{{INTENSITY}}`
   and `{{EXCLUDE}}` placeholders the Worker fills per request. Wording identical to
   the previous hardcoded prompt.
2. `worker/model-config.md` — documented knobs in a single ```json``` block:
   `maxOutputTokens`, `temperature` (null = model default), `topP` (null = default),
   and `intensity` (`default` + `levels[]` of `{level,label,directive}`). Notes that
   `MODEL_ALLOWLIST` / `MAX_INPUT_CHARS` stay in `wrangler.toml` and UI labels in
   `src/config.ts`.
3. `worker/wrangler.toml` — `[[rules]] type = "Text" globs = ["**/*.md"]` so the
   Markdown imports resolve.
4. `worker/src/index.ts` — import both files; parse the json block; derive
   `MIN/MAX/DEFAULT` intensity, `MAX_OUTPUT_TOKENS`, levels; rewrite
   `intensityDirective` and `buildSystemPrompt` to read config + fill the template;
   send `temperature`/`top_p` only when set.
5. Spec: document the two files under The Worker; bump the version.

## Do not implement

- changing the prompt wording or default behaviour (temperature/topP default to
  unset);
- moving the model allowlist or input cap out of `wrangler.toml`;
- exposing the prompt to the browser / runtime end-user editing.

## Acceptance criteria

- `npm run check` passes and `wrangler deploy --dry-run` succeeds (the Text modules
  bundle).
- The generated prompt is byte-identical to the previous hardcoded one.
- Editing `prompt.md` / `model-config.md` changes behaviour with no code edit.

## Automated checks

```bash
npm run check
cd worker && npx wrangler deploy --dry-run
```

## Manual verification

After deploy: roast a profile and confirm output is unchanged; tweak a directive in
`model-config.md`, redeploy, and confirm the change takes effect.

## Commit and push

Commit using this file's exact filename (`043_externalise_prompt_and_params.md`),
then push.

## Final report

End with the required five-section final report specified in `AGENTS.md`.
