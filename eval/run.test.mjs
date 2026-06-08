// Integration test for the eval runner in --mock mode: exercises roast.md parsing,
// the shared prompt assembly, candidate-count behaviour and results serialisation —
// no API key, no network.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const repoRoot = fileURLToPath(new URL('../', import.meta.url))

test('run.mjs --mock yields valid results with correct candidate counts and fields', () => {
  const runId = `unittest-${process.pid}`
  const outPath = join(repoRoot, 'eval', 'results', `${runId}.json`)
  execFileSync('node', ['eval/run.mjs', '--mock', '--runId', runId], { cwd: repoRoot, stdio: 'pipe' })
  const run = JSON.parse(readFileSync(outPath, 'utf8'))
  try {
    assert.equal(run.mock, true)
    assert.equal(run.totals.failures, 0)
    assert.ok(run.results.length > 0)

    // candidate-count behaviour: best_of_3 = 3 per profile, single-candidate = 1.
    const profiles = [...new Set(run.results.map((r) => r.profileId))]
    for (const pid of profiles) {
      const bo3 = run.results.filter((r) => r.profileId === pid && r.conditionId === 'best_of_3')
      const base = run.results.filter((r) => r.profileId === pid && r.conditionId === 'baseline')
      assert.equal(bo3.length, 3, `best_of_3 should have 3 candidates for ${pid}`)
      assert.equal(base.length, 1, `baseline should have 1 candidate for ${pid}`)
    }

    // serialisation: every record carries the fields the comparison UI/export need.
    for (const r of run.results) {
      for (const k of ['id', 'profileId', 'conditionId', 'conditionLabel', 'model', 'roast', 'costUsd']) {
        assert.ok(k in r, `result missing field ${k}`)
      }
    }
  } finally {
    rmSync(outPath, { force: true })
  }
})
