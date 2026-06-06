# Content to provide for the roast stylebook prompts

What you need to collect before running `016_roast_stylebook.md` and
`017_style_exemplars.md`. The coding agent writes the determinate parts (the
mechanics rules, the safety mirror, the file scaffolding); the comedic and
evaluative content is yours to supply, per the repository's document contract
("Reference material — you provide: examples, prior art, or research notes").

In priority order.

## 1. Held-out test profiles — the one indispensable input

Three to five short profile snippets to run the A/B comparison in both prompts.
Without these you cannot judge whether the change improves specificity, and the
whole rationale rests on that being tested rather than assumed.

- Use synthetic or thoroughly anonymised material — no real identifiable
  researchers, since text may be logged upstream and the content rules forbid it.
- Cover a range: a thin profile, a metrics-heavy one, a jargon-heavy one.

## 2. Generic clichés to avoid

The lines you have seen models default to ("h-index in witness protection",
"your jargon needs a grant", and the like). These populate the stylebook's
"lines to avoid" slot and sharpen prompt iteration.

## 3. Good/bad example pairs (development-only)

A handful of pairs: a concrete profile detail transformed into a *specific* joke
(good) beside the *generic* version of the same idea (bad). Authoring reference
only — these never reach the model, so they are low-risk, but they need
real-ish profile snippets to write against (reuse the synthetic ones from item 1).

## 4. Intensity register, in your voice

A sentence each for how mild / medium / spicy should *feel*, if the current
one-line directives do not capture your intent. This refines wording, not scope.

## 5. Only if you run prompt 017 — three fictional exemplars

One synthetic profile-plus-roast per intensity, fully invented and
non-identifiable. This is the only comedic content that would reach the model,
so it carries the mimicry and safety risk and must be authored or explicitly
approved by you, not generated unreviewed.

## What you do not need to provide

- The comic-mechanics rules and the safety exclusions — both determinate and
  specified in the prompts.
- Any change to British English — already the project convention.

## One coupling to keep in mind

Items 2–4 live only in `docs-dev/` and inform how you tune the canonical Worker
block. To avoid the stale-duplicate drift the repository already shows elsewhere,
treat the Worker block as the single source of truth for what the model sees and
let the stylebook reference it rather than restate it.

The housekeeping items mentioned in the original note (stale `current_state.md`,
an outdated `ui.ts` comment, missing `noindex`, placeholder docs, a thin privacy
notice) were largely addressed during prompts 008 and 015; re-check before
assuming any remain.
