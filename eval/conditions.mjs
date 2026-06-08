// Experiment conditions for the blinded humour evaluation. Each condition isolates
// one of the main interventions. They are resolved against worker/roast.md at run
// time (its `models`, `formats`, `exemplars`, intensity directives and prompt body).
//
// Fields:
//   id          stable identifier (used in exports)
//   label       human description (hidden during blinded rating, shown in exports)
//   model       'base' → roast.md `model:`; a bucket name in `models`; or a direct
//               OpenRouter slug (lets you test a stronger model without editing prod)
//   format      a format key from roast.md (`straight` = plain roast)
//   exemplars   true to force one rotated exemplar in, false for none
//   candidates  how many independent candidates to generate (best-of-N is human-picked)
//   intensity   intensity level (1..N)
//   temperature sampling temperature for candidate diversity (independent samples)
//
// NOTE: the revised single-angle comic prompt already ships in roast.md, so every
// condition uses it; 'baseline' is the current production config (base model,
// straight format, one candidate). To A/B the OLD vs NEW prompt, add a condition
// with `promptBodyFile` pointing at a saved alternate prompt body (run.mjs supports
// it) — see docs/evaluation.md.

export const conditions = [
  {
    id: 'baseline',
    label: 'Baseline: base model (gemini-2.5-flash), straight roast',
    model: 'base',
    format: 'straight',
    exemplars: false,
    candidates: 1,
    intensity: 3,
    temperature: 1.0,
  },
  {
    id: 'quality_model',
    label: 'Quality bucket (claude-sonnet-4.5), straight roast',
    model: 'quality',
    format: 'straight',
    exemplars: false,
    candidates: 1,
    intensity: 3,
    temperature: 1.0,
  },
  {
    id: 'quality_format',
    label: 'Quality model + Reviewer 2 format',
    model: 'quality',
    format: 'reviewer2',
    exemplars: false,
    candidates: 1,
    intensity: 3,
    temperature: 1.0,
  },
  {
    id: 'exemplar_on',
    label: 'Exemplar on (quality model)',
    model: 'quality',
    format: 'straight',
    exemplars: true,
    candidates: 1,
    intensity: 3,
    temperature: 1.0,
  },
  {
    id: 'best_of_3',
    label: 'Best-of-3 (base model), human-selected',
    model: 'base',
    format: 'straight',
    exemplars: false,
    candidates: 3,
    intensity: 3,
    temperature: 1.05,
  },
]
