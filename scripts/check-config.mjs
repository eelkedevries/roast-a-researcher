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
  }

  for (const ph of ['{{INTENSITY}}', '{{EXCLUDE}}']) {
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
