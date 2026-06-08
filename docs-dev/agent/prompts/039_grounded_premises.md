# Task: Ground every roast line in the supplied text

## Goal

Stop the model inventing comedic *premises* the input gives no basis for. The
existing rules forbid invented factual allegations (fraud, misconduct, fabricated
employers/degrees/metrics), but a roast can still assert a behavioural premise the
profile never supported — e.g. "Finally, a field for academics who've spent too
long at conferences" when nothing in the input mentions conferences or time spent
at them. Every statement must be at least somewhat based on what was actually
supplied.

## Scope

A wording change to the system prompt's content rules (`buildSystemPrompt` in
`worker/src/index.ts`) plus a matching note in the specification. No behavioural
code, UI, or retrieval changes.

## Required reading

`docs-dev/reference/primary_authoritative/specification.md`: Roast generation
(Thin input, Outside knowledge, Content rules the floor).

## Required changes

1. `worker/src/index.ts`, `buildSystemPrompt`: add a content-rule bullet (the
   floor, so it holds at every intensity including "show no mercy") requiring
   every line to be anchored to the supplied text — the model may exaggerate or
   spin what is genuinely there, but must not invent the premise itself, and must
   not attribute behaviours, habits, traits, attitudes, or characterisations the
   text gives no basis for (e.g. time at conferences, ego, work habits,
   lifestyle). If the supplied input could not have given the idea, cut the line;
   sense-check each line against the text before keeping it.
2. `specification.md`: in the Content rules (the floor) list and/or the Outside
   knowledge paragraph, record that invented *premises* (not only invented
   allegations) are out of bounds — every line must trace to the supplied text.
   Bump the version.

## Do not implement

- a separate verification/grading pass or second model call;
- any change to intensity behaviour, output format, or retrieval.

## Acceptance criteria

- `npm run check` passes and `wrangler deploy --dry-run` succeeds.
- The system prompt explicitly forbids invented premises, with grounding required
  for every line; the spec records the same and its version is bumped.

## Automated checks

```bash
npm run check
cd worker && npx wrangler deploy --dry-run
```

## Manual verification

After deploy: roast a thin profile that mentions no conferences/awards/habits and
confirm the roast no longer invents behavioural premises like time at conferences.

## Commit and push

Commit using this file's exact filename (`039_grounded_premises.md`), then push.

## Final report

End with the required five-section final report specified in `AGENTS.md`.
