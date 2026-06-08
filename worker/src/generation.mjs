// Pure, dependency-free helpers for roast generation: model routing, comedic-format
// and exemplar selection, and system-prompt assembly. Imported by the Worker
// (worker/src/index.ts, bundled by esbuild/wrangler), the evaluation harness (eval/),
// and the unit tests (worker/src/generation.test.mjs). Keep every function pure and
// side-effect-free so the same behaviour is exercised in production and in tests.
//
// Design intent: ALL routing/format/exemplar features default to "off" so a config
// that omits them reproduces the original single-model, straight-roast behaviour
// exactly. Humour features are opt-in via worker/roast.md.

/**
 * Resolve a model bucket name to a concrete slug. Every bucket defaults to the
 * legacy single `model:` (baseModel), so an unset bucket changes nothing.
 * @param {{models?: Record<string,string>}|undefined} cfg parsed frontmatter
 * @param {string} baseModel the `model:` value — default for every bucket
 * @param {string} bucket e.g. 'lowCost' | 'quality' | 'experimental'
 * @returns {string}
 */
export function modelForBucket(cfg, baseModel, bucket) {
  const models = (cfg && cfg.models) || {}
  const slug = models[bucket]
  return typeof slug === 'string' && slug.trim() ? slug.trim() : baseModel
}

/**
 * Choose the model slug for a request. Precedence: explicit eval override →
 * regenerate routing → per-intensity routing → base model (current behaviour).
 * @param {object|undefined} cfg parsed frontmatter (may contain models, routing)
 * @param {string} baseModel
 * @param {{intensity:number, regenerate?:boolean, evalModel?:string}} ctx
 * @returns {{model:string, bucket:string}}
 */
export function selectModel(cfg, baseModel, ctx) {
  if (ctx && typeof ctx.evalModel === 'string' && ctx.evalModel.trim()) {
    return { model: ctx.evalModel.trim(), bucket: 'eval' }
  }
  const routing = (cfg && cfg.routing) || {}
  if (ctx && ctx.regenerate && routing.regenerate) {
    return { model: modelForBucket(cfg, baseModel, routing.regenerate), bucket: routing.regenerate }
  }
  const byIntensity = routing.byIntensity || {}
  // YAML keys may parse as numbers or strings depending on quoting; accept both.
  const bucket = byIntensity[ctx.intensity] ?? byIntensity[String(ctx.intensity)]
  if (typeof bucket === 'string' && bucket.trim()) {
    return { model: modelForBucket(cfg, baseModel, bucket), bucket }
  }
  return { model: baseModel, bucket: 'base' }
}

/**
 * The fallback model slug used when the selected model errors. Defaults to the
 * base model when no `routing.fallback` bucket is configured.
 * @param {object|undefined} cfg
 * @param {string} baseModel
 * @returns {string}
 */
export function fallbackModel(cfg, baseModel) {
  const routing = (cfg && cfg.routing) || {}
  return routing.fallback ? modelForBucket(cfg, baseModel, routing.fallback) : baseModel
}

/**
 * Look up a comedic-format preset's directive by key. Unknown or empty key →
 * the straight roast (no extra framing, current behaviour).
 * @param {Array<{key:string,label?:string,directive?:string}>|undefined} formats
 * @param {string|undefined} key
 * @returns {{key:string, directive:string}}
 */
export function formatDirectiveFor(formats, key) {
  if (!Array.isArray(formats) || typeof key !== 'string' || !key) {
    return { key: 'straight', directive: '' }
  }
  const f = formats.find((x) => x && x.key === key)
  if (!f) return { key: 'straight', directive: '' }
  return { key: f.key, directive: typeof f.directive === 'string' ? f.directive : '' }
}

/**
 * Deterministically pick one exemplar from the pool by rotating on `seed`, or
 * return null when exemplars are disabled / the pool is empty. Determinism keeps a
 * given profile stable across retries while different profiles rotate, reducing
 * cross-user phrase copying.
 * @param {{enabled?:boolean, pool?:string[]}|undefined} exemplars
 * @param {number} seed non-negative integer (e.g. a profile hash)
 * @returns {{index:number, text:string}|null}
 */
export function pickExemplar(exemplars, seed) {
  if (!exemplars || !exemplars.enabled) return null
  const pool = Array.isArray(exemplars.pool)
    ? exemplars.pool.filter((s) => typeof s === 'string' && s.trim())
    : []
  if (!pool.length) return null
  const n = pool.length
  const index = ((Math.trunc(Number(seed) || 0) % n) + n) % n
  return { index, text: pool[index] }
}

/** A small, stable non-negative hash of a string (for exemplar rotation seeds). */
export function hashString(s) {
  let h = 2166136261
  const str = String(s)
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Build the `{{INTENSITY}}` line. */
export function intensityLine(level, levelCount, directive) {
  return `Intensity (level ${level} of ${levelCount}). ${directive}`
}

/** Build the `{{FORMAT}}` block from a preset directive (empty → no framing). */
export function formatBlock(directive) {
  return directive && directive.trim()
    ? `Comedic format — deliver the roast in this frame (it shapes the rhetoric and progression, never the facts, and must stay within the content rules and grounding above):\n${directive.trim()}`
    : ''
}

const EXEMPLAR_PREAMBLE =
  'The following is a roast of a DIFFERENT, unrelated person, included ONLY to show the SHAPE of a strong roast — its compression, escalation and closing turn. Learn the structure; never reuse its wording, phrasing, jokes, names or facts. Your roast must be entirely about, and grounded in, the supplied profile.'

/** Wrap an exemplar string in its structure-only framing (empty → ''). */
export function exemplarBlock(text) {
  if (!text || !String(text).trim()) return ''
  return `${EXEMPLAR_PREAMBLE}\n\n--- EXAMPLE (structure only; do not copy) ---\n${String(text).trim()}\n--- END EXAMPLE ---`
}

/**
 * Fill the prompt template's placeholders. Function replacers are used so
 * user-derived text (the exclude block) may contain `$&`/`` $` ``/`$'`/`$$` without
 * corrupting the result. Collapses runs of blank lines left by empty placeholders.
 * @param {string} template the prose body of roast.md
 * @param {{intensity:string, exclude?:string, format?:string, exemplar?:string}} parts
 * @returns {string}
 */
export function assemblePrompt(template, parts) {
  return template
    .replace('{{INTENSITY}}', () => parts.intensity || '')
    .replace('{{EXCLUDE}}', () => parts.exclude || '')
    .replace('{{FORMAT}}', () => parts.format || '')
    .replace('{{EXEMPLAR}}', () => parts.exemplar || '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
