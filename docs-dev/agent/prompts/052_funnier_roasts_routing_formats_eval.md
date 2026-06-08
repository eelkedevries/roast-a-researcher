# Task: Improve roast humour — model routing, single-angle prompt, formats, exemplars, and a blinded eval harness

## Goal

Make roasts funnier through the levers actually associated with comic quality —
stronger models, a sharper prompt, strong comedic formats, controlled exemplars, and
human evaluation — without weakening grounding, factuality, privacy or safety. All
production changes default to the current single-model, straight-roast behaviour and
cost; the humour features are opt-in and decided empirically by the eval harness.

## Verified models (OpenRouter, Jun 2026, USD per 1M tok in/out)

`google/gemini-2.5-flash-lite` 0.10/0.40 · `google/gemini-2.5-flash` 0.30/2.50
(current) · `google/gemini-2.5-pro` 1.25/10 · `anthropic/claude-sonnet-4.5` 3/15.

## Required changes

1. **Shared helpers** `worker/src/generation.mjs` (pure, dependency-free): model
   routing (`selectModel`/`fallbackModel`/`modelForBucket`), `formatDirectiveFor`,
   `pickExemplar` (deterministic rotation) + `hashString`, and prompt assembly
   (`intensityLine`/`formatBlock`/`exemplarBlock`/`assemblePrompt`). Shared by the
   Worker, the eval harness, and the tests.
2. **`worker/roast.md`**: revised single-angle comic prompt (Style section — find ONE
   strongest incongruous/self-undermining/disproportionate detail and develop it;
   specificity/escalation/contrast/strong close; no joke-explaining, no cushioning),
   grounding + content rules preserved verbatim; new `{{FORMAT}}`/`{{EXEMPLAR}}`
   placeholders; opt-in `models`/`routing`/`formats`/`defaultFormat`/`exemplars` config
   (all defaulting to the base model + straight format + exemplars off).
3. **Worker** `index.ts`: parse the new config; route the model per intensity /
   regenerate with a single fallback retry; inject the chosen format and an optional
   rotated exemplar; read `body.format`/`body.regenerate` (client never sends a slug).
4. **`scripts/check-config.mjs`**: validate the new optional config and require the new
   placeholders.
5. **Front end**: `src/config.ts` format list; `src/ui.ts` Format selector + send
   `format`/`regenerate` (re-roast sets regenerate); minimal `src/style.css`.
6. **Eval harness** `eval/` (local, not deployed): `run.mjs` (multi-candidate
   generation across conditions on synthetic `profiles.json`, records
   model/tokens/latency/cost, `--mock` mode), `conditions.mjs`, `prices.json`,
   `cost.mjs`, and a blinded pairwise `compare.html` (hidden labels, randomised L/R,
   best-of-N, CSV/JSON export — never an LLM judge for funniness).
7. **Tests** (`npm test`, node --test): generation helpers, cost, and an eval-run
   integration test; CI runs them.
8. **Docs**: `docs/configuration.md`, new `docs/evaluation.md`,
   `docs/spend-and-limits.md` price table, spec + `current_state` (spec → v1.39).

## Acceptance criteria

- `npm run check`, `npm test`, and `wrangler deploy --dry-run` pass; defaults preserve
  current behaviour (a test asserts every bucket resolves to the base model).
- Grounding/safety text preserved verbatim (a test asserts the markers survive
  assembly); humour features are opt-in; eval data exports as CSV/JSON.

## Commit and push

Commit using this file's exact filename, then push; confirm CI green.
