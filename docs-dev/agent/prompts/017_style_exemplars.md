# Task: Optional, flag-gated style exemplars (one per intensity)

## Goal

Add at most one short fictional exemplar per intensity behind a default-off flag,
so its effect on roast quality can be A/B-tested before any production use.

## Scope

Implement only the work described in this prompt. Do not implement adjacent
systems or future prompts.

## Context

Few-shot exemplars can calibrate register but risk mimicry and cross-user
repetition, so they ship disabled and are kept only if they demonstrably help.
The system prompt is built in `worker/src/index.ts` (`buildSystemPrompt()`).
Depends on `016_roast_stylebook.md`. The exemplar text is human-supplied or
human-approved (see the stylebook example slots); it must be fictional and
non-identifiable.

## Required changes

1. In `worker/src/index.ts`, add a single module-level boolean constant
   `INCLUDE_STYLE_EXEMPLARS`, default `false`.
2. Add a constant mapping each intensity (`mild`/`medium`/`spicy`) to exactly one
   short fictional exemplar (a brief synthetic profile snippet and the roast it
   should yield), taken from the human-approved stylebook slots.
3. When `INCLUDE_STYLE_EXEMPLARS` is `true`, append only the exemplar matching
   the chosen intensity to the system prompt, framed explicitly as register
   calibration, not material to reuse. When `false`, the assembled prompt is
   byte-identical to prompt 016's output.

## Do not implement

Do not implement:
- more than one exemplar per intensity;
- any real or identifiable person, institution, or genuine scandal;
- enabling the flag by default, or removing it;
- new files or modules, or any change to the content rules.

## Acceptance criteria

The task is complete when:
- the flag exists and defaults to `false`; with it `false` the prompt is
  unchanged from prompt 016;
- three fictional, non-identifiable exemplars exist, one per intensity;
- with the flag `true`, only the matching-intensity exemplar appears in the
  assembled prompt;
- the verify command and the Worker dry-run pass;
- a manual A/B run (flag off vs on) on the supplied test profiles has been done;
  the flag is left `true` only if specificity improves without visible
  repetition or genericity, and `false` otherwise.

## Checks

```bash
npm run check
cd worker && npx wrangler deploy --dry-run
```

## Commit and push

If and only if the scope was followed and checks pass, create one commit on
`main` using this file's exact filename (`017_style_exemplars.md`) as the commit
message, then push.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required final report specified in `AGENTS.md`.
