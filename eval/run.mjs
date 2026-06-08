// Evaluation runner: generate roast candidates for every (profile × condition ×
// candidate) and write a results file for blinded human comparison (open
// eval/compare.html). Reuses the production prompt-assembly helpers
// (worker/src/generation.mjs) and reads worker/roast.md so the eval exercises the
// same generation logic as the deployed Worker. Calls OpenRouter directly (the
// Worker only streams); use --mock to exercise the whole pipeline with no API key.
//
// Usage:
//   OPENROUTER_API_KEY=... node eval/run.mjs              # real generations
//   node eval/run.mjs --mock                              # fixtures, no API key/cost
//   node eval/run.mjs --candidates 3 --runId pilot01      # overrides
//
// Privacy/cost: profiles are the synthetic eval/profiles.json only; nothing is sent
// anywhere except OpenRouter, and only in non-mock mode. See docs/evaluation.md.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import {
  assemblePrompt,
  formatDirectiveFor,
  formatBlock,
  exemplarBlock,
  pickExemplar,
  hashString,
  intensityLine,
} from '../worker/src/generation.mjs'
import { estimateCost } from './cost.mjs'
import { conditions as defaultConditions } from './conditions.mjs'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

function parseArgs(argv) {
  const a = { mock: false }
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i]
    if (t === '--mock') a.mock = true
    else if (t === '--candidates') a.candidates = Number(argv[++i])
    else if (t === '--runId') a.runId = argv[++i]
    else if (t === '--out') a.out = argv[++i]
  }
  return a
}

function readConfig() {
  const src = readFileSync(here('../worker/roast.md'), 'utf8')
  const m = src.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!m) throw new Error('worker/roast.md: missing YAML frontmatter')
  return { cfg: parseYaml(m[1]), body: m[2] }
}

function resolveModel(spec, models, baseModel) {
  if (!spec || spec === 'base') return baseModel
  if (models && typeof models[spec] === 'string' && models[spec].trim()) return models[spec]
  return spec // a direct OpenRouter slug
}

// Build the system prompt for a condition, reusing the production helpers. Optional
// promptBodyFile lets a condition A/B an alternate prompt body (e.g. the old prompt).
function buildSystem(body, cfg, cond, profileText) {
  const levels = Array.isArray(cfg.intensity) ? cfg.intensity : []
  const level = Math.min(levels.length || 1, Math.max(1, cond.intensity || cfg.defaultIntensity || 1))
  const directive = (levels[level - 1] || levels[levels.length - 1] || {}).directive || ''
  const fmt = formatDirectiveFor(cfg.formats || [], cond.format)
  const ex = cond.exemplars
    ? pickExemplar({ enabled: true, pool: (cfg.exemplars && cfg.exemplars.pool) || [] }, hashString(profileText))
    : null
  const promptBody = cond.promptBodyFile ? readFileSync(here(cond.promptBodyFile), 'utf8') : body
  return assemblePrompt(promptBody, {
    intensity: intensityLine(level, levels.length || 1, directive),
    exclude: '',
    format: formatBlock(fmt.directive),
    exemplar: ex ? exemplarBlock(ex.text) : '',
  })
}

function extractRoast(text) {
  const parts = String(text).split('===ROAST===')
  return (parts.length > 1 ? parts.slice(1).join('===ROAST===') : text).trim()
}

async function callOpenRouter({ apiKey, model, system, user, maxTokens, temperature }) {
  const t0 = Date.now()
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      ...(typeof temperature === 'number' ? { temperature } : {}),
      usage: { include: true },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  })
  const latencyMs = Date.now() - t0
  if (!res.ok) {
    throw new Error(`OpenRouter ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
  }
  const data = await res.json()
  const u = data.usage || {}
  return {
    text: data.choices?.[0]?.message?.content ?? '',
    latencyMs,
    promptTokens: u.prompt_tokens ?? null,
    completionTokens: u.completion_tokens ?? null,
  }
}

function mockCall({ model, cond, candidateIndex, profile }) {
  const roast = `[MOCK ${cond.id} · ${model} · candidate ${candidateIndex + 1}] ${profile.name}: a placeholder roast produced without an API key so the pipeline and the blinded comparison UI can be exercised end to end (variation seed ${candidateIndex}).`
  return {
    text: `{"name":"${profile.name}"}\n===ROAST===\n${roast}`,
    latencyMs: 1,
    promptTokens: 600 + candidateIndex,
    completionTokens: Math.ceil(roast.length / 4),
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const apiKey = process.env.OPENROUTER_API_KEY
  const mock = args.mock || !apiKey
  if (mock && !args.mock) {
    console.error('No OPENROUTER_API_KEY set — running in --mock mode (no real generations).')
  }

  const { cfg, body } = readConfig()
  const baseModel = cfg.model
  const maxTokens = Number(cfg.maxOutputTokens) || 1500
  const prices = JSON.parse(readFileSync(here('./prices.json'), 'utf8'))
  const profiles = JSON.parse(readFileSync(here('./profiles.json'), 'utf8')).profiles
  const conditions = defaultConditions
  const runId = args.runId || `run-${Date.now()}`

  const results = []
  let idx = 0
  for (const profile of profiles) {
    for (const cond of conditions) {
      const candidates = args.candidates || cond.candidates || 1
      const model = resolveModel(cond.model, cfg.models, baseModel)
      const system = buildSystem(body, cfg, cond, profile.profile)
      const user = `<<<PROFILE\n${profile.profile}\nPROFILE>>>`
      for (let ci = 0; ci < candidates; ci++) {
        const base = {
          id: `r${idx++}`,
          profileId: profile.id,
          profileName: profile.name,
          conditionId: cond.id,
          conditionLabel: cond.label,
          candidateIndex: ci,
          model,
          format: cond.format,
          exemplars: !!cond.exemplars,
          intensity: cond.intensity,
          temperature: cond.temperature ?? null,
        }
        try {
          const gen = mock
            ? mockCall({ model, cond, candidateIndex: ci, profile })
            : await callOpenRouter({ apiKey, model, system, user, maxTokens, temperature: cond.temperature })
          results.push({
            ...base,
            raw: gen.text,
            roast: extractRoast(gen.text),
            promptTokens: gen.promptTokens,
            completionTokens: gen.completionTokens,
            latencyMs: gen.latencyMs,
            costUsd: estimateCost(model, gen.promptTokens ?? 0, gen.completionTokens ?? 0, prices),
          })
          process.stdout.write('.')
        } catch (e) {
          results.push({ ...base, error: String((e && e.message) || e) })
          process.stdout.write('x')
        }
      }
    }
  }
  process.stdout.write('\n')

  const ok = results.filter((r) => !r.error)
  const totalCost = ok.reduce((s, r) => s + (r.costUsd || 0), 0)
  const run = {
    runId,
    createdAt: new Date().toISOString(),
    mock,
    baseModel,
    conditions,
    totals: {
      generations: results.length,
      failures: results.length - ok.length,
      totalCostUsd: Number(totalCost.toFixed(4)),
      costByModel: ok.reduce((m, r) => {
        m[r.model] = Number(((m[r.model] || 0) + (r.costUsd || 0)).toFixed(4))
        return m
      }, {}),
    },
    results,
  }

  const outDir = here('./results')
  mkdirSync(outDir, { recursive: true })
  const outPath = args.out || `${outDir}/${runId}.json`
  writeFileSync(outPath, JSON.stringify(run, null, 2))
  console.error(
    `Wrote ${results.length} generations (${run.totals.failures} failed) to ${outPath}\n` +
      `Estimated cost: $${run.totals.totalCostUsd} ${mock ? '(MOCK — no real cost)' : ''}\n` +
      `Next: open eval/compare.html and load that file to rate blind.`,
  )
}

main().catch((e) => {
  console.error('eval run failed:', e)
  process.exitCode = 1
})
