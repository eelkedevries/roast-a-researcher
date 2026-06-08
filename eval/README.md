# Roast humour evaluation

A small, local harness to measure whether a change actually makes roasts funnier —
by **blinded human comparison**, not an LLM judge. It reuses the production
prompt-assembly logic (`worker/src/generation.mjs`) and reads `worker/roast.md`, so
it exercises the same generation the deployed Worker does. Nothing here is deployed.

## What it does

- `run.mjs` generates roast candidates for every (synthetic profile × condition ×
  candidate) and writes a results file with model, tokens, latency and estimated
  cost per generation.
- `compare.html` loads that file and runs a **blinded, randomised** comparison:
  model/condition labels are hidden, left/right is shuffled, you pick the funnier
  roast (and optionally rate funniness / specificity / originality / grounding /
  harshness), then export CSV/JSON.

## Files

- `profiles.json` — 10 synthetic, fictional academic profiles (no real people).
- `conditions.mjs` — the experiment conditions (baseline, stronger model, +format,
  exemplar on, best-of-3). Edit to add your own.
- `prices.json` — OpenRouter prices (per 1e6 tokens), isolated from code.
- `run.mjs` — the generator. `cost.mjs` — pure cost estimator.
- `compare.html` — the blinded pairwise rater.
- `results/` — generated run files (git-ignored).

## Running a comparison

```bash
# 1. Dry-run the whole pipeline with NO API key and NO cost (fixtures):
node eval/run.mjs --mock

# 2. Real generations (uses your OpenRouter key; costs money — synthetic profiles only):
OPENROUTER_API_KEY=sk-... node eval/run.mjs --runId pilot01

# 3. Rate blind: open eval/compare.html in a browser, load eval/results/pilot01.json,
#    judge each pair, then Export JSON/CSV.
```

Useful flags: `--candidates N` (override per-condition count), `--runId <id>`,
`--out <path>`.

## Notes

- The revised single-angle comic prompt already ships in `worker/roast.md`, so every
  condition uses it; `baseline` is the current production config. To A/B the **old**
  vs **new** prompt, save the old prompt body to a file and add a condition with
  `promptBodyFile: '<relative path>'` in `conditions.mjs`.
- Humour is judged by people. The harness only tallies preference proportions/counts;
  it makes **no** statistical claim from a small pilot.
- Cost figures are estimates from `prices.json` × token counts, not a bill.
- See `docs/evaluation.md` for the full procedure and how to act on the results
  (e.g. enabling quality routing in `roast.md`).
