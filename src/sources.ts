// Detects which structured source an identifier/URL belongs to, and retrieves it
// via the Worker's /retrieve path. Arbitrary URLs (Scholar, LinkedIn, personal
// sites) are not supported — they return null and the UI advises pasting text.

export type SourceKind = 'orcid' | 'openalex' | 'github' | 'semanticscholar'

export function detectSource(input: string): { source: SourceKind; id: string } | null {
  const s = input.trim()
  if (!s) return null

  // Bare identifiers.
  if (/^\d{4}-\d{4}-\d{4}-\d{3}[\dxX]$/.test(s)) return { source: 'orcid', id: s }
  if (/^A\d{5,}$/i.test(s)) return { source: 'openalex', id: s }

  // URLs (or host-like tokens).
  if (/^https?:\/\//i.test(s) || s.includes('.')) {
    try {
      const url = new URL(s.startsWith('http') ? s : `https://${s}`)
      const host = url.hostname.replace(/^www\./, '')
      if (host === 'orcid.org' || host.endsWith('.orcid.org')) return { source: 'orcid', id: s }
      if (host === 'openalex.org' || host.endsWith('.openalex.org')) return { source: 'openalex', id: s }
      if (host === 'github.com' || host.endsWith('.github.com')) return { source: 'github', id: s }
      if (host === 'semanticscholar.org' || host.endsWith('.semanticscholar.org')) {
        const m = url.pathname.match(/(\d{3,})/)
        return m ? { source: 'semanticscholar', id: m[1] } : null
      }
      return null // a URL we do not support
    } catch {
      return null
    }
  }

  // A bare token: treat as a GitHub username.
  if (/^[a-zA-Z0-9-]{1,39}$/.test(s)) return { source: 'github', id: s }
  return null
}

export interface SourceStats {
  source: string
  title: string
  entries: Array<{ label: string; value: string }>
}

export interface ChartData {
  worksPerYear?: Array<{ year: number; value: number }>
  citationsPerYear?: Array<{ year: number; value: number }>
  openAccess?: Array<{ status: string; count: number }>
  topCountries?: Array<{ country: string; count: number }>
  topVenues?: Array<{ venue: string; count: number }>
}

export interface RetrieveResult {
  ok: boolean
  text?: string
  reason?: string
  stats?: SourceStats
  charts?: ChartData
}

export interface Candidate {
  id: string
  name: string
  affiliation: string | null
}

export interface SearchResult {
  ok: boolean
  candidates?: Candidate[]
  reason?: string
}

// Search a source by name via the Worker's /search path, returning candidate
// matches the user picks from. Identifier-anchored: each candidate carries the
// concrete source id that retrieval then uses.
export async function searchSource(
  workerUrl: string,
  source: SourceKind,
  query: string,
): Promise<SearchResult> {
  try {
    const response = await fetch(`${workerUrl}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, query }),
    })
    const data = (await response.json().catch(() => null)) as
      | { candidates?: Candidate[]; error?: string; message?: string }
      | null
    if (response.ok && Array.isArray(data?.candidates)) {
      return { ok: true, candidates: data.candidates }
    }
    return { ok: false, reason: data?.message ?? 'Search is not available for this source.' }
  } catch {
    return { ok: false, reason: 'Network error during search.' }
  }
}

export async function retrieveSource(
  workerUrl: string,
  source: SourceKind,
  id: string,
): Promise<RetrieveResult> {
  try {
    const response = await fetch(`${workerUrl}/retrieve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, id }),
    })
    const data = (await response.json().catch(() => null)) as
      | { text?: string; stats?: SourceStats; charts?: ChartData; error?: string; message?: string }
      | null
    if (response.ok && data?.text) {
      return { ok: true, text: data.text, stats: data.stats, charts: data.charts }
    }
    return { ok: false, reason: data?.message ?? 'Could not retrieve this link.' }
  } catch {
    return { ok: false, reason: 'Network error retrieving this link.' }
  }
}
