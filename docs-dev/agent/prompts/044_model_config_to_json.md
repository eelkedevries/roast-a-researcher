# Task: Move model parameters from a Markdown-embedded JSON block into a real JSON file

## Goal

`worker/model-config.md` currently documents the generation knobs in prose AND
carries the live values in a fenced ```json``` block that `worker/src/index.ts`
extracts with a regex and `JSON.parse`s. Replace the regex extraction with a real
`worker/model-config.json` imported natively by the Worker. Keep `model-config.md`
as the human documentation (no embedded values). The prompt template (`prompt.md`)
is unchanged.

## Why

- esbuild/wrangler parse imported `.json` natively → a malformed edit fails
  `wrangler deploy --dry-run` (build-time), instead of throwing on the first
  request at runtime.
- Removes the brittle `/```json …```/` first-fence regex.
- No new dependency.

## Scope

Worker only. No front-end change. No change to default behaviour, prompt wording,
or parameter values.

## Required reading

`docs-dev/reference/primary_authoritative/specification.md`: Architecture → The
Worker.

## Required changes

1. `worker/model-config.json` — new file: exactly the object currently inside the
   `json` block of `model-config.md` (`maxOutputTokens`, `temperature`, `topP`,
   `intensity{default,levels[]}`), values byte-identical.
2. `worker/model-config.md` — remove the fenced `json` block; keep the prose that
   documents each knob and the "settings live elsewhere" note. State that the live
   values are in `model-config.json` (single source of truth; do not duplicate
   them here).
3. `worker/src/index.ts` — replace `import modelConfigMd from '../model-config.md'`
   and the `loadModelConfig` regex/JSON.parse with a native JSON import
   (`import modelConfigJson from '../model-config.json'`), typed as the existing
   `ModelConfig`. Delete `loadModelConfig`. Everything downstream
   (`INTENSITY_LEVELS`, `MAX_OUTPUT_TOKENS`, temperature/topP gating) reads the same
   shape unchanged.
4. `worker/wrangler.toml` — keep the `**/*.md` Text rule (still needed for
   `prompt.md`). Update the nearby comment to note that `model-config.json` is bundled
   via esbuild's native JSON loader, not the Text rule.
5. Spec: update The Worker section (prompt.md as a Text module; model-config.json
   parsed natively; model-config.md as the doc companion) and bump the version.

## Do not implement

- changing any parameter value, the prompt wording, or default behaviour;
- adding a JSON5/JSONC parser or any dependency;
- moving `MODEL_ALLOWLIST` / `MAX_INPUT_CHARS` out of `wrangler.toml`;
- exposing config to the browser.

## Acceptance criteria

- `npm run check` passes and `cd worker && npx wrangler deploy --dry-run` succeeds.
- Generated prompt and roast behaviour are unchanged (values identical).
- Editing `model-config.json` changes behaviour with no code edit; a syntax error in
  it fails the dry-run.

## Automated checks

```bash
npm run check
cd worker && npx wrangler deploy --dry-run
```

## Manual verification

Tweak a directive in `model-config.json`, redeploy, confirm the change takes effect;
introduce a deliberate JSON syntax error and confirm `wrangler deploy --dry-run`
fails, then revert.

## Commit and push

Commit using this file's exact filename (`044_model_config_to_json.md`), then push.

## Final report

End with the required five-section final report specified in `AGENTS.md`.
