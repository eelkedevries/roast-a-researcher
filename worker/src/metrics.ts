// Pure citation-metric functions over a retrieved publication list. Each work is
// just { citations, year }; metrics that need data the works do not carry are
// omitted by the caller rather than guessed. Used by the OpenAlex retrieval path
// to fold a compact, factual metrics block into the roast input (016).

export interface Work {
  citations: number
  year: number | null
}

function sortedCitations(works: Work[]): number[] {
  return works.map((w) => w.citations || 0).sort((a, b) => b - a)
}

export function totalCitations(works: Work[]): number {
  return works.reduce((sum, w) => sum + (w.citations || 0), 0)
}

// h-index: the largest h such that h papers each have at least h citations.
export function hIndex(works: Work[]): number {
  const c = sortedCitations(works)
  let h = 0
  for (let i = 0; i < c.length; i++) {
    if (c[i] >= i + 1) h = i + 1
    else break
  }
  return h
}

// g-index: the largest g such that the top g papers together have at least g²
// citations.
export function gIndex(works: Work[]): number {
  const c = sortedCitations(works)
  let sum = 0
  let g = 0
  for (let i = 0; i < c.length; i++) {
    sum += c[i]
    if (sum >= (i + 1) * (i + 1)) g = i + 1
    else break
  }
  return g
}

// i10-index: the number of papers with at least 10 citations.
export function i10Index(works: Work[]): number {
  return works.filter((w) => (w.citations || 0) >= 10).length
}

// h5-index: the h-index restricted to papers from the last five calendar years.
export function h5Index(works: Work[], currentYear: number): number {
  const recent = works.filter((w) => w.year != null && w.year >= currentYear - 4)
  return hIndex(recent)
}

export function meanCitations(works: Work[]): number {
  return works.length ? totalCitations(works) / works.length : 0
}

// A compact, labelled metrics block, or null when there are no works to measure.
// h5 is omitted when no work carries a year, so no number is invented.
export function metricsSummary(works: Work[], currentYear: number): string | null {
  if (!works.length) return null
  const parts = [
    `citations: ${totalCitations(works)}`,
    `h-index: ${hIndex(works)}`,
    `g-index: ${gIndex(works)}`,
    `i10: ${i10Index(works)}`,
  ]
  if (works.some((w) => w.year != null)) {
    parts.push(`h5: ${h5Index(works, currentYear)}`)
  }
  parts.push(`mean/paper: ${meanCitations(works).toFixed(1)}`)
  return `Metrics (computed from ${works.length} works) — ${parts.join('; ')}`
}
