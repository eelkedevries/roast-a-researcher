// Unit tests for the shared generation helpers (model routing, formats, exemplars,
// prompt assembly). Run with `npm test` (node --test). Pure functions only — no
// network, no worker runtime.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import {
  modelForBucket,
  selectModel,
  fallbackModel,
  formatDirectiveFor,
  pickExemplar,
  hashString,
  intensityLine,
  formatBlock,
  exemplarBlock,
  assemblePrompt,
} from './generation.mjs'

const BASE = 'google/gemini-2.5-flash'

test('modelForBucket falls back to base when bucket is unset/blank', () => {
  assert.equal(modelForBucket(undefined, BASE, 'quality'), BASE)
  assert.equal(modelForBucket({ models: {} }, BASE, 'quality'), BASE)
  assert.equal(modelForBucket({ models: { quality: '  ' } }, BASE, 'quality'), BASE)
  assert.equal(modelForBucket({ models: { quality: 'anthropic/claude-sonnet-4.5' } }, BASE, 'quality'), 'anthropic/claude-sonnet-4.5')
})

test('selectModel: no routing → base model (current behaviour preserved)', () => {
  assert.deepEqual(selectModel(undefined, BASE, { intensity: 3 }), { model: BASE, bucket: 'base' })
  assert.deepEqual(selectModel({}, BASE, { intensity: 1 }), { model: BASE, bucket: 'base' })
})

test('selectModel: per-intensity routing (numeric and string keys)', () => {
  const cfg = {
    models: { lowCost: 'google/gemini-2.5-flash-lite', quality: 'anthropic/claude-sonnet-4.5' },
    routing: { byIntensity: { 1: 'lowCost', 2: 'quality', 3: 'quality' } },
  }
  assert.equal(selectModel(cfg, BASE, { intensity: 1 }).model, 'google/gemini-2.5-flash-lite')
  assert.equal(selectModel(cfg, BASE, { intensity: 3 }).model, 'anthropic/claude-sonnet-4.5')
  // string-keyed byIntensity (YAML may quote keys) resolves the same
  const cfg2 = { ...cfg, routing: { byIntensity: { '2': 'quality' } } }
  assert.equal(selectModel(cfg2, BASE, { intensity: 2 }).model, 'anthropic/claude-sonnet-4.5')
})

test('selectModel: regenerate routing overrides per-intensity', () => {
  const cfg = {
    models: { lowCost: 'lc', quality: 'q' },
    routing: { byIntensity: { 3: 'lowCost' }, regenerate: 'quality' },
  }
  assert.equal(selectModel(cfg, BASE, { intensity: 3, regenerate: false }).model, 'lc')
  assert.equal(selectModel(cfg, BASE, { intensity: 3, regenerate: true }).model, 'q')
})

test('selectModel: explicit eval model wins over everything', () => {
  const cfg = { models: { quality: 'q' }, routing: { byIntensity: { 3: 'quality' } } }
  assert.deepEqual(selectModel(cfg, BASE, { intensity: 3, evalModel: 'x/y' }), { model: 'x/y', bucket: 'eval' })
})

test('fallbackModel: configured bucket, else base', () => {
  assert.equal(fallbackModel(undefined, BASE), BASE)
  assert.equal(fallbackModel({ models: { lowCost: 'lc' }, routing: { fallback: 'lowCost' } }, BASE), 'lc')
})

test('formatDirectiveFor: unknown/empty → straight, known → directive', () => {
  const formats = [
    { key: 'straight', directive: '' },
    { key: 'reviewer2', directive: 'as Reviewer 2' },
  ]
  assert.deepEqual(formatDirectiveFor(formats, undefined), { key: 'straight', directive: '' })
  assert.deepEqual(formatDirectiveFor(formats, 'nope'), { key: 'straight', directive: '' })
  assert.deepEqual(formatDirectiveFor(formats, 'reviewer2'), { key: 'reviewer2', directive: 'as Reviewer 2' })
})

test('pickExemplar: disabled/empty → null; enabled rotates deterministically', () => {
  assert.equal(pickExemplar({ enabled: false, pool: ['a'] }, 1), null)
  assert.equal(pickExemplar({ enabled: true, pool: [] }, 1), null)
  const ex = { enabled: true, pool: ['a', 'b', 'c'] }
  assert.equal(pickExemplar(ex, 0).text, 'a')
  assert.equal(pickExemplar(ex, 1).text, 'b')
  assert.equal(pickExemplar(ex, 4).text, 'b') // 4 % 3 = 1
  // same seed → same pick (stable across retries)
  assert.equal(pickExemplar(ex, 7).index, pickExemplar(ex, 7).index)
  // negative seed handled
  assert.ok(pickExemplar(ex, -1) !== null)
})

test('hashString is stable and non-negative', () => {
  assert.equal(hashString('abc'), hashString('abc'))
  assert.notEqual(hashString('abc'), hashString('abd'))
  assert.ok(hashString('anything') >= 0)
})

test('assemblePrompt fills placeholders, is $-safe, and collapses blank runs', () => {
  const tmpl = 'A\n{{INTENSITY}}\n\n{{FORMAT}}\n\nB\n{{EXEMPLAR}}\n\n{{EXCLUDE}}'
  const out = assemblePrompt(tmpl, {
    intensity: 'Intensity (level 3 of 3). X',
    exclude: '- Cost-benefit: $& analysis', // $& must survive verbatim
    format: '',
    exemplar: '',
  })
  assert.ok(out.includes('Intensity (level 3 of 3). X'))
  assert.ok(out.includes('- Cost-benefit: $& analysis'))
  assert.ok(!out.includes('{{')) // all placeholders consumed
  assert.ok(!/\n{3,}/.test(out)) // blank runs collapsed
})

test('formatBlock / exemplarBlock are empty for empty input, framed otherwise', () => {
  assert.equal(formatBlock(''), '')
  assert.ok(formatBlock('as Reviewer 2').includes('as Reviewer 2'))
  assert.equal(exemplarBlock(''), '')
  const eb = exemplarBlock('once upon a time')
  assert.ok(eb.includes('once upon a time'))
  assert.ok(/structure/i.test(eb)) // structure-only framing present
})

test('intensityLine format', () => {
  assert.equal(intensityLine(2, 3, 'do it'), 'Intensity (level 2 of 3). do it')
})

// Integration: the real roast.md assembles cleanly and PRESERVES grounding/safety.
test('production roast.md preserves grounding + safety markers after assembly', () => {
  const src = readFileSync(fileURLToPath(new URL('../roast.md', import.meta.url)), 'utf8')
  const m = src.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  const cfg = parseYaml(m[1])
  const body = m[2]
  const levels = cfg.intensity
  const out = assemblePrompt(body, {
    intensity: intensityLine(3, levels.length, levels[2].directive),
    exclude: '',
    format: formatBlock(formatDirectiveFor(cfg.formats, 'reviewer2').directive),
    exemplar: '',
  })
  // grounding + safety must remain verbatim
  assert.ok(out.includes('Ground every line in the supplied text'))
  assert.ok(out.includes('No content targeting protected characteristics'))
  assert.ok(out.includes('Never manufacture misconduct'))
  assert.ok(out.includes('ABSOLUTE RULE on repeated/similar titles'))
  // output contract intact
  assert.ok(out.includes('===ROAST==='))
  // chosen format applied; no leftover placeholders
  assert.ok(out.includes("Reviewer 2's referee report"))
  assert.ok(!out.includes('{{'))
})

// The shipped roast.md routing resolves each tier to the configured bucket model,
// and every routed model exists in the price table (so cost is always estimable).
test('shipped roast.md routing matches its configured buckets and known prices', () => {
  const src = readFileSync(fileURLToPath(new URL('../roast.md', import.meta.url)), 'utf8')
  const cfg = parseYaml(src.match(/^---\n([\s\S]*?)\n---/)[1])
  const prices = JSON.parse(
    readFileSync(fileURLToPath(new URL('../../eval/prices.json', import.meta.url)), 'utf8'),
  )
  const bucketModel = (b) => cfg.models[b]
  // byIntensity maps each level to its bucket's model
  for (const [lvl, bucket] of Object.entries(cfg.routing.byIntensity)) {
    assert.equal(selectModel(cfg, cfg.model, { intensity: Number(lvl) }).model, bucketModel(bucket))
  }
  // regenerate + fallback resolve to their buckets
  assert.equal(
    selectModel(cfg, cfg.model, { intensity: 1, regenerate: true }).model,
    bucketModel(cfg.routing.regenerate),
  )
  assert.equal(fallbackModel(cfg, cfg.model), bucketModel(cfg.routing.fallback))
  // every model the worker can route to (base + buckets) has a price entry
  const routed = new Set([cfg.model, ...Object.values(cfg.models)])
  for (const m of routed) assert.ok(prices[m], `price table missing ${m}`)
})
