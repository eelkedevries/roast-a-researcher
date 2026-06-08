// Cost estimation for the evaluation harness. Pure and table-driven so prices stay
// out of the logic (see eval/prices.json) and the function is unit-testable.

/**
 * Estimate the USD cost of a generation from a price table (prices per 1e6 tokens).
 * @param {string} model OpenRouter model slug
 * @param {number} inputTokens
 * @param {number} outputTokens
 * @param {Record<string,{input:number,output:number}>} table price table
 * @returns {number|null} estimated USD, or null when the model is not in the table
 */
export function estimateCost(model, inputTokens, outputTokens, table) {
  const p = table && table[model]
  if (!p || typeof p.input !== 'number' || typeof p.output !== 'number') return null
  const inTok = Number(inputTokens) || 0
  const outTok = Number(outputTokens) || 0
  return (inTok / 1e6) * p.input + (outTok / 1e6) * p.output
}
