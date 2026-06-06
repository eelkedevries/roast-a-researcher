# Task: Trend analysis for the roast

## Goal

Analyse the per-year and breakdown series and fold a compact, factual trend summary
into the roast input — career trajectory, citation peak year, recent rise or
decline, most productive period, dominant venue — so the model can roast the arc of
a career, not just static totals.

## Scope

Compute trends Worker-side from the chart data and append them to the retrieved
text. Do not render anything and do not add a source.

## Required reading

`docs-dev/reference/primary_authoritative/specification.md`: Domain rules (Roast
content, register, and safety — thin input, no invented specifics; Later data
sources — OpenAlex), Architecture (The Worker).

## Dependencies

`025_chart_data` (the per-year and breakdown series).

## Required changes

1. Add pure, testable functions (e.g. in `metrics.ts` or a sibling module) over the
   series: detect the citation peak year, recent trajectory (rising/declining/flat
   over the last few years), most productive year(s), and the dominant venue.
2. Append a compact, labelled `Trends:` block to the retrieved text with only
   factual, supported statements; omit any line whose data is insufficient (do not
   invent a trajectory from one or two data points).
3. Keep the wording neutral and factual — the comedic spin is the model's job; this
   block only supplies grounded observations.

## Do not implement

Do not implement:
- charts or any rendering (that is `027_charts`);
- forecasting or speculative claims;
- a new source or any keyed/paid API; storing data.

## Acceptance criteria

The task is complete when:
- the retrieved text gains a factual `Trends:` block when the series support it, and
  omits lines cleanly when data is thin, verified on a small hand case;
- no statement is unsupported by the series;
- the build and Worker dry-run pass.

## Automated checks

```bash
npm run check
cd worker && npx wrangler deploy --dry-run
```

## Manual verification

Retrieve an author with a long record and confirm the trend lines match the
per-year series; retrieve a one-paper author and confirm the block is omitted.

## Commit and push

If and only if the scope was followed and checks pass, create one commit on
`main` using this file's exact filename (`026_trend_analysis.md`) as the commit
message, then push.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required five-section final report specified in `AGENTS.md`.
