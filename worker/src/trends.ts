// Pure trend analysis over an author's per-year series, for a factual "Trends:"
// block in the roast input (026). Every statement must be supported by the data;
// thin series yield fewer (or no) lines rather than invented trajectories.

export interface YearPoint {
  year: number
  works: number
  citations: number
}

function maxBy(points: YearPoint[], pick: (p: YearPoint) => number): YearPoint | null {
  let best: YearPoint | null = null
  for (const p of points) {
    if (pick(p) > 0 && (!best || pick(p) > pick(best))) best = p
  }
  return best
}

export function peakCitationYear(points: YearPoint[]): number | null {
  if (points.length < 2) return null
  return maxBy(points, (p) => p.citations)?.year ?? null
}

export function mostProductiveYear(points: YearPoint[]): YearPoint | null {
  if (points.length < 2) return null
  return maxBy(points, (p) => p.works)
}

// Compares mean citations of the last three years with the three before them.
export function recentTrajectory(
  points: YearPoint[],
): 'rising' | 'declining' | 'flat' | null {
  if (points.length < 6) return null
  const sorted = [...points].sort((a, b) => a.year - b.year)
  const mean = (xs: YearPoint[]): number =>
    xs.reduce((s, p) => s + p.citations, 0) / xs.length
  const recent = mean(sorted.slice(-3))
  const prior = mean(sorted.slice(-6, -3))
  if (prior === 0) return recent > 0 ? 'rising' : 'flat'
  const change = (recent - prior) / prior
  if (change > 0.1) return 'rising'
  if (change < -0.1) return 'declining'
  return 'flat'
}

// Factual trend lines; each is omitted when the series cannot support it.
export function trendSummary(
  points: YearPoint[],
  dominantVenue: string | null,
): string[] {
  const lines: string[] = []
  const peak = peakCitationYear(points)
  if (peak != null) lines.push(`Citations peaked in ${peak}.`)
  const productive = mostProductiveYear(points)
  if (productive) {
    lines.push(`Most productive year: ${productive.year} (${productive.works} works).`)
  }
  const trajectory = recentTrajectory(points)
  if (trajectory) lines.push(`Recent citation trajectory: ${trajectory}.`)
  if (dominantVenue) lines.push(`Most-published venue: ${dominantVenue}.`)
  return lines
}
