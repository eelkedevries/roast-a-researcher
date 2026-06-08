import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estimateCost } from './cost.mjs'

const table = { 'a/b': { input: 1, output: 2 } }

test('estimateCost computes USD from the price table', () => {
  assert.equal(estimateCost('a/b', 1e6, 1e6, table), 3)
  assert.equal(estimateCost('a/b', 0, 0, table), 0)
  assert.equal(estimateCost('a/b', 500000, 250000, table), 0.5 * 1 + 0.25 * 2)
})

test('estimateCost returns null for unknown model or missing table', () => {
  assert.equal(estimateCost('x/y', 1, 1, table), null)
  assert.equal(estimateCost('a/b', 1, 1, undefined), null)
  assert.equal(estimateCost('a/b', 1, 1, { 'a/b': { input: 'x' } }), null)
})
