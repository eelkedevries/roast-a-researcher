# Evaluating roast humour

Grounding and safety keep roasts factual and within the rules; they do not make them
funny. To decide humour questions empirically — is a stronger model worth it? does a
format or an exemplar help? — use the local evaluation harness in `eval/`. It uses
**blinded human comparison**, not an LLM judge. (An LLM may still be used for
mechanical checks like grounding or format compliance, never to pick the funniest.)

Nothing in `eval/` is deployed, and it only ever uses the synthetic, fictional
profiles in `eval/profiles.json` — never real or private people.

## What gets compared

`eval/conditions.mjs` defines conditions that isolate each intervention:

| Condition | Isolates |
|---|---|
| `baseline` | current production config (base model, straight roast, 1 candidate) |
| `stronger_model` | a materially stronger model only |
| `stronger_format` | stronger model + a comedic format preset |
| `exemplar_on` | one rotated exemplar vs none |
| `best_of_3` | 3 independent candidates, best picked by a human |

The revised single-angle comic prompt already ships in `worker/roast.md`, so every
condition uses it. To A/B the **old vs new prompt**, save the old prompt body to a
file and add a condition with `promptBodyFile: '<relative path>'` in `conditions.mjs`.

## Running a blinded comparison

```bash
# Dry-run the whole pipeline with no API key and no cost (fixtures):
node eval/run.mjs --mock

# Real generations (uses your OpenRouter key; costs money — synthetic profiles only):
OPENROUTER_API_KEY=sk-... node eval/run.mjs --runId pilot01
```

This writes `eval/results/<runId>.json` with, per generation: model, prompt/completion
tokens, latency, estimated cost (from `eval/prices.json`), and the roast. Then:

```
Open eval/compare.html in a browser → load eval/results/pilot01.json
```

The page hides model/condition labels, randomises left/right and order, lets you pick
the funnier roast (and optionally rate funniness / specificity / originality /
grounding / harshness), handles best-of-N selection, then **Export JSON / CSV**. It
reports preference counts and win rates — proportions only, with no statistical claim
from a small pilot.

## Acting on the results

If a stronger `quality` model wins clearly and the cost is acceptable, enable it in
`worker/roast.md` (`models.quality: anthropic/claude-sonnet-4.5`; `routing.byIntensity`
already routes levels 2–3 to `quality`) and redeploy. If a format or exemplar wins,
keep it as a preset / set `exemplars.enabled: true`. Keep the price table in
`eval/prices.json` and `docs/spend-and-limits.md` current.

## Cost and operational notes

- Cost is an **estimate** (price table × token counts), not a bill. Compare at
  representative roast sizes.
- Quality routing is **selective** by design — only stronger tiers / regenerate use the
  quality model, so the most expensive model is not used on every request. The mild
  tier and the fallback stay cheap.
- The unit tests for the routing/format/exemplar logic and the harness run with
  `npm test`.
