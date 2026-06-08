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

## Pilot findings (June 2026)

A full real run (80 generations, ~$0.60) across the conditions, followed by an
automated mechanical review (grounding/safety/contract — not funniness):

- **Gemini 2.5 Pro is unusable here.** As a reasoning model it returned *empty*
  visible content (all tokens spent on hidden reasoning) and never produced the
  JSON+`===ROAST===` contract. It is kept only as an experimental A/B slot, flagged
  in `roast.md`; production is **not** routed to it.
- **Claude Sonnet 4.5 is the quality pick.** Sharper, more single-angle roasts than
  the flash baseline, with **0/10 grounding fabrications** and all naming the
  researcher. It wraps the leading JSON in ```code fences```; the front-end parser
  was made marker-preferring so this renders cleanly (personalia still parse).
- Residual issues fixed/handled: stray markdown emphasis (`*word*`) and a rare
  foreign-glyph artifact → added a plain-prose instruction and strip markdown
  asterisks at the display layer. One similar-title-rule slip and one borderline
  "fraudster" simile in 10 — low-rate adherence slips; all content rules remain in
  the prompt unchanged. Re-run the eval after prompt changes to confirm.

Production therefore routes mild → `google/gemini-2.5-flash`, stronger tiers +
regenerate → `anthropic/claude-sonnet-4.5`, fallback → flash. Revert any of this with
one line in `roast.md`.

## Cost and operational notes

- Cost is an **estimate** (price table × token counts), not a bill. Compare at
  representative roast sizes.
- Quality routing is **selective** by design — only stronger tiers / regenerate use the
  quality model, so the most expensive model is not used on every request. The mild
  tier and the fallback stay cheap.
- The unit tests for the routing/format/exemplar logic and the harness run with
  `npm test`.
