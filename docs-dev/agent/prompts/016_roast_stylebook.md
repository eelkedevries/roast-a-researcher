# Task: Roast stylebook and a short server-side mechanics block

## Goal

Add a development-time roast stylebook and a small set of comic-transformation
rules to the Worker system prompt, improving roast specificity without adding a
runtime joke bank.

## Scope

Implement only the work described in this prompt. Do not implement adjacent
systems or future prompts.

## Context

The Worker builds a fixed server-side system prompt in
`worker/src/index.ts` (`buildSystemPrompt()`); its `Style:` block already names
the *targets* (publications, venues, methods, jargon, grant-chasing,
self-branding, the gap between presentation and record). What it lacks is
guidance on the *mechanics* of turning a supplied detail into a joke. The
content rules in that function are the safety floor and must not be weakened.
Reference-material conventions: `docs-dev/agent/document_contract.md`
(Reference material section); specification Domain rules → "Roast content,
register, and safety".

## Required changes

1. Create `docs-dev/reference/secondary_background/roast_stylebook.md`
   (non-binding authoring reference, British English). Include these sections,
   filling the determinate ones and leaving clearly marked `TODO` slots for the
   human-supplied examples:
   - **Purpose and status** — one line stating this file is authoring/iteration
     reference only; the guidance the model actually sees lives in
     `worker/src/index.ts` (`buildSystemPrompt()`) and is canonical. This file
     must not be injected at runtime and must not duplicate the runtime rules
     verbatim; where they overlap, the Worker wins.
   - **Comic mechanics** — the transformation moves (running motifs from a
     repeated acronym/method/venue/buzzword; polished self-description to mundane
     reality; concrete-detail exaggeration without inventing facts; stated
     ambition versus actual output).
   - **Intensity calibration** — short notes on how mild/medium/spicy should read
     in this project's voice (mirror, do not contradict, the existing intensity
     directives).
   - **Safety exclusions** — mirror the Worker's content rules; do not expand
     their scope.
   - **Good vs bad examples** — `TODO` slots: profile-detail → specific joke
     (good) paired with the generic equivalent (bad). Human-supplied.
   - **Generic lines to avoid** — `TODO` slot for observed clichés. Human-supplied.

2. In `worker/src/index.ts`, extend the existing `Style:` block inside
   `buildSystemPrompt()` with a short set of mechanics lines (a handful of
   sentences, not a new section). Do not restate the existing target list. Keep
   the additions inline; do not introduce new files or modules. Suggested lines:
   - build each joke from a concrete detail in the supplied profile;
   - turn a repeated acronym, method, venue, or buzzword into a running motif;
   - translate polished self-description into mundane reality;
   - exaggerate a concrete detail into absurd institutional significance,
     inventing no facts;
   - reject any line that could apply to any researcher.

## Do not implement

Do not implement:
- a runtime folder or corpus of anecdotes, reusable setups, or pre-written
  roasts; nor random/keyword joke selection; nor any retrieval;
- few-shot exemplars in the system prompt (that is prompt 017);
- new prompt modules or a split of `buildSystemPrompt()` into separate files;
- any change to the content rules, intensity scaling, or safety wording;
- any client-side or `public/` reference material.

## Acceptance criteria

The task is complete when:
- `roast_stylebook.md` exists at the path above with the determinate sections
  filled and the example/cliché slots marked `TODO`, and states the Worker block
  is canonical;
- `buildSystemPrompt()` contains the new mechanics lines, the existing target
  list is unchanged, and no new files were added to `worker/`;
- the verify command and the Worker dry-run pass;
- a manual A/B run (human-judged) on the supplied test profiles shows outputs
  still obey the content rules and are at least as specific as the prior prompt.

## Checks

Run the project's verify command and the Worker build check:

```bash
npm run check
cd worker && npx wrangler deploy --dry-run
```

## Commit and push

If and only if the scope was followed and checks pass, create one commit on
`main` using this file's exact filename (`016_roast_stylebook.md`) as the commit
message, then push.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required final report specified in `AGENTS.md`.
