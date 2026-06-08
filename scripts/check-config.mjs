// Validate worker/roast.md before it ships. Run from `npm run check` and from the
// deploy workflow (see .github/workflows/deploy-worker.yml), so a malformed edit to
// the single config file fails with a clear message instead of breaking the live
// Worker on its next request. Keep this in step with the parsing in
// worker/src/index.ts (splitFrontmatter + the RawConfig shape).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'

const path = fileURLToPath(new URL('../worker/roast.md', import.meta.url))
const errors = []

let src = ''
try {
  src = readFileSync(path, 'utf8')
} catch {
  errors.push(`cannot read ${path}`)
}

const match = src.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
if (src && !match) {
  errors.push('missing YAML frontmatter delimited by --- lines at the top of the file')
}

if (match) {
  const [, frontmatter, body] = match

  let cfg
  try {
    cfg = parseYaml(frontmatter)
  } catch (e) {
    errors.push(`frontmatter is not valid YAML: ${e.message}`)
  }

  if (cfg && typeof cfg === 'object') {
    if (typeof cfg.model !== 'string' || !cfg.model.trim()) {
      errors.push('`model` must be a non-empty string (an openrouter.ai model slug)')
    }
    if (!Number.isInteger(cfg.maxOutputTokens) || cfg.maxOutputTokens <= 0) {
      errors.push('`maxOutputTokens` must be a positive whole number')
    }
    // temperature 0–2, topP 0–1 (matching OpenRouter); `default` leaves it unset.
    const ranges = { temperature: [0, 2, 'between 0 and 2'], topP: [0, 1, 'above 0 and at most 1'] }
    for (const knob of ['temperature', 'topP']) {
      const v = cfg[knob]
      if (v === 'default' || v === null || v === undefined) continue
      if (typeof v !== 'number') {
        errors.push(`\`${knob}\` must be a number or the word \`default\``)
        continue
      }
      const [lo, hi, label] = ranges[knob]
      const lowOk = knob === 'topP' ? v > lo : v >= lo
      if (!lowOk || v > hi) {
        errors.push(`\`${knob}\` must be ${label} (or \`default\`)`)
      }
    }
    if (!Array.isArray(cfg.intensity) || cfg.intensity.length === 0) {
      errors.push('`intensity` must be a non-empty list of { label, directive }')
    } else {
      cfg.intensity.forEach((lvl, i) => {
        const n = i + 1
        if (!lvl || typeof lvl.label !== 'string' || !lvl.label.trim()) {
          errors.push(`intensity level ${n}: \`label\` must be a non-empty string`)
        }
        if (!lvl || typeof lvl.directive !== 'string' || !lvl.directive.trim()) {
          errors.push(`intensity level ${n}: \`directive\` must be a non-empty string`)
        }
      })
    }
    const levels = Array.isArray(cfg.intensity) ? cfg.intensity.length : 0
    if (
      !Number.isInteger(cfg.defaultIntensity) ||
      cfg.defaultIntensity < 1 ||
      (levels && cfg.defaultIntensity > levels)
    ) {
      errors.push(
        `\`defaultIntensity\` must be a whole level number between 1 and ${levels || 'the number of levels'}`,
      )
    }

    // ── Optional humour config (model routing, formats, exemplars). Absent ⇒
    // current single-model, straight-roast behaviour, so only validate when present.
    const modelKeys =
      cfg.models && typeof cfg.models === 'object' && !Array.isArray(cfg.models)
        ? Object.keys(cfg.models)
        : []
    const knownBucket = (b) => modelKeys.length === 0 || modelKeys.includes(b)
    if (cfg.models !== undefined) {
      if (typeof cfg.models !== 'object' || Array.isArray(cfg.models)) {
        errors.push('`models` must be a map of bucket → model slug')
      } else {
        for (const [k, v] of Object.entries(cfg.models)) {
          if (typeof v !== 'string' || !v.trim()) errors.push(`models.${k} must be a non-empty model slug`)
        }
      }
    }
    if (cfg.routing !== undefined) {
      if (typeof cfg.routing !== 'object' || Array.isArray(cfg.routing)) {
        errors.push('`routing` must be a map (byIntensity, regenerate, fallback)')
      } else {
        const bi = cfg.routing.byIntensity
        if (bi !== undefined) {
          if (typeof bi !== 'object' || Array.isArray(bi)) {
            errors.push('routing.byIntensity must be a map of level → bucket')
          } else {
            for (const [lvl, b] of Object.entries(bi)) {
              if (typeof b !== 'string' || !knownBucket(b)) {
                errors.push(`routing.byIntensity.${lvl} must name a key of \`models\``)
              }
            }
          }
        }
        for (const key of ['regenerate', 'fallback']) {
          const b = cfg.routing[key]
          if (b !== undefined && (typeof b !== 'string' || !knownBucket(b))) {
            errors.push(`routing.${key} must name a key of \`models\``)
          }
        }
      }
    }
    const formatKeys = []
    if (cfg.formats !== undefined) {
      if (!Array.isArray(cfg.formats) || cfg.formats.length === 0) {
        errors.push('`formats` must be a non-empty list of { key, label, directive }')
      } else {
        cfg.formats.forEach((f, i) => {
          if (!f || typeof f.key !== 'string' || !f.key.trim()) {
            errors.push(`formats[${i}].key must be a non-empty string`)
          } else {
            formatKeys.push(f.key)
          }
          if (f && f.directive !== undefined && typeof f.directive !== 'string') {
            errors.push(`formats[${i}].directive must be a string`)
          }
        })
        if (new Set(formatKeys).size !== formatKeys.length) {
          errors.push('`formats` keys must be unique')
        }
      }
    }
    if (cfg.defaultFormat !== undefined) {
      if (typeof cfg.defaultFormat !== 'string') {
        errors.push('`defaultFormat` must be a string')
      } else if (formatKeys.length && !formatKeys.includes(cfg.defaultFormat)) {
        errors.push(`\`defaultFormat\` (${cfg.defaultFormat}) must be one of the format keys`)
      }
    }
    if (cfg.exemplars !== undefined) {
      const ex = cfg.exemplars
      if (typeof ex !== 'object' || Array.isArray(ex)) {
        errors.push('`exemplars` must be a map { enabled, pool }')
      } else {
        if (ex.enabled !== undefined && typeof ex.enabled !== 'boolean') {
          errors.push('exemplars.enabled must be true or false')
        }
        if (ex.pool !== undefined && !Array.isArray(ex.pool)) {
          errors.push('exemplars.pool must be a list of strings')
        } else if (Array.isArray(ex.pool)) {
          ex.pool.forEach((s, i) => {
            if (typeof s !== 'string') errors.push(`exemplars.pool[${i}] must be a string`)
          })
        }
        const usablePool = Array.isArray(ex.pool)
          ? ex.pool.filter((s) => typeof s === 'string' && s.trim()).length
          : 0
        if (ex.enabled === true && usablePool === 0) {
          errors.push('exemplars.enabled is true but exemplars.pool has no usable entries')
        }
      }
    }
  }

  for (const ph of ['{{INTENSITY}}', '{{FORMAT}}', '{{EXEMPLAR}}', '{{EXCLUDE}}']) {
    if (!body.includes(ph)) {
      errors.push(`prompt body is missing the ${ph} placeholder`)
    }
  }
}

if (errors.length) {
  console.error('worker/roast.md is invalid:')
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}
console.log('worker/roast.md is valid.')
