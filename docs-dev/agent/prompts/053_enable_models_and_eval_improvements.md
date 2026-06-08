# Task: Enable the stronger models, run the full evaluation, and improve from it

## Goal

Turn on the humour model routing (best-guess models), run the full real evaluation,
and apply the improvements it reveals — without weakening grounding or safety.

## What was done

1. **Enabled routing** in `worker/roast.md`: mild tier → `google/gemini-2.5-flash`,
   stronger tiers + regenerate → `anthropic/claude-sonnet-4.5`, fallback → flash.
2. **Ran the full eval** (`node eval/run.mjs`, 80 real generations, ~$0.60) across all
   conditions on the 10 synthetic profiles, then an automated mechanical review
   (grounding/safety/contract — not funniness).
3. **Findings → improvements:**
   - `google/gemini-2.5-pro` returned EMPTY content (reasoning model; breaks the
     JSON+`===ROAST===` contract) → demoted to the experimental A/B slot only, flagged
     in `roast.md`; production not routed to it.
   - `anthropic/claude-sonnet-4.5` is sharper, grounded (0/10 fabrications) but wraps
     the leading JSON in code fences → made the front-end roast extraction
     **marker-preferring** (`roastBody` in `src/ui.ts`) so it renders cleanly;
     personalia still parse via the existing tolerant extractor.
   - Stray markdown emphasis / plain-text artifacts → added a "plain prose, no
     markdown" instruction to `roast.md` and strip stray asterisks at the display
     layer.
   - Updated `eval/conditions.mjs` (quality bucket now Sonnet; dropped the broken Pro
     condition) and the routing unit test; documented findings in
     `docs/evaluation.md`, `docs/configuration.md`, `docs/spend-and-limits.md`.

## Acceptance criteria

- `npm run check`, `npm test` (17), and `wrangler deploy --dry-run` pass.
- Grounding/safety rules unchanged; the eval review confirmed Sonnet grounding is
  intact (0 fabrications). Residual low-rate content-rule slips documented.

## Commit and push

Commit using this file's exact filename, then push; confirm CI green.
