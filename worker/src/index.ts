// Cloudflare Worker: a thin, OpenAI-compatible proxy that turns supplied profile
// text into a comedic roast via OpenRouter. It holds the API key as a secret and
// carries the content rules in a fixed, server-side system prompt. This is the
// system prompt. It streams the roast (004) and enforces a per-IP daily limit
// via Workers KV (005). See the specification, Architecture → The Worker.

import { metricsSummary, computeMetrics } from './metrics'
import { continentOf, countryName } from './geo'
import { trendSummary, type YearPoint } from './trends'
// User-facing configuration, kept out of this file: the single file `roast.md`
// holds the model, the generation parameters (YAML frontmatter) and the prompt
// instructions (the prose body). It is bundled as a Text module (see wrangler.toml
// [[rules]]) and split + parsed below. Edit that one file, not the code here.
import roastMd from '../roast.md'
import { parse as parseYaml } from 'yaml'
// Pure generation helpers (model routing, comedic formats, exemplars, prompt
// assembly). Shared with the eval harness and the unit tests; see generation.mjs.
import {
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

// Minimal shape of the Workers KV binding we use (avoids a full
// @cloudflare/workers-types dependency for a single counter).
interface KvCounter {
  get(key: string): Promise<string | null>
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>
}

export interface Env {
  ALLOW_ORIGIN: string
  MAX_INPUT_CHARS: string
  DAILY_LIMIT: string
  OPENROUTER_API_KEY: string
  IP_HASH_SALT: string
  RATE_LIMIT: KvCounter
  GITHUB_TOKEN?: string
  ORCID_TOKEN?: string
  OPENALEX_API_KEY?: string
  OPENALEX_MAILTO?: string
  S2_API_KEY?: string
  RETRIEVE_CACHE_TTL?: string
  RETRIEVE_DAILY_LIMIT?: string
  // ORCID login (033–035). The four vars are non-secret (wrangler.toml); the two
  // secrets are set with `wrangler secret put`. All optional: when CLIENT_ID /
  // CLIENT_SECRET / SESSION_SECRET are absent the Worker treats login as disabled.
  ORCID_OAUTH_BASE?: string
  ORCID_CLIENT_ID?: string
  ORCID_REDIRECT_URI?: string
  APP_URL?: string
  ORCID_CLIENT_SECRET?: string
  SESSION_SECRET?: string
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

// --- model configuration & prompt (from roast.md) ---

interface IntensityLevel {
  level: number
  label: string
  directive: string
}
// Raw frontmatter shape: temperature/topP may be a number or the word `default`.
interface RawConfig {
  model: string
  maxOutputTokens: number
  temperature: number | string | null
  topP: number | string | null
  defaultIntensity: number
  intensity: { label: string; directive: string }[]
  // Optional humour features — absent ⇒ current single-model, straight-roast behaviour.
  models?: Record<string, string>
  routing?: {
    byIntensity?: Record<string, string>
    regenerate?: string
    fallback?: string
  }
  defaultFormat?: string
  formats?: { key: string; label?: string; directive?: string }[]
  exemplars?: { enabled?: boolean; pool?: string[] }
}

// roast.md is one file: YAML frontmatter (the knobs) between `---` fences, then the
// prompt body. scripts/check-config.mjs validates the same file at build/deploy time,
// so a malformed edit fails before it ships; here we split and parse it at startup.
function splitFrontmatter(src: string): { data: string; body: string } {
  const m = src.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!m) throw new Error('roast.md: missing YAML frontmatter delimited by --- lines')
  return { data: m[1], body: m[2] }
}

const { data: roastFrontmatter, body: promptTemplate } = splitFrontmatter(roastMd)
const RAW_CONFIG = parseYaml(roastFrontmatter) as RawConfig
// `default` (or any non-number) leaves the knob unset so the model uses its own.
const numOrNull = (v: number | string | null): number | null =>
  typeof v === 'number' ? v : null
const MODEL_CONFIG = {
  model: RAW_CONFIG.model,
  maxOutputTokens: RAW_CONFIG.maxOutputTokens,
  temperature: numOrNull(RAW_CONFIG.temperature),
  topP: numOrNull(RAW_CONFIG.topP),
}
// Levels are numbered by their order in the list (first entry is level 1).
const INTENSITY_LEVELS: IntensityLevel[] = RAW_CONFIG.intensity.map((l, i) => ({
  level: i + 1,
  label: l.label,
  directive: l.directive,
}))
const MIN_INTENSITY = Math.min(...INTENSITY_LEVELS.map((l) => l.level))
const MAX_INTENSITY = Math.max(...INTENSITY_LEVELS.map((l) => l.level))
const DEFAULT_INTENSITY = Math.round(RAW_CONFIG.defaultIntensity)
const MAX_OUTPUT_TOKENS = MODEL_CONFIG.maxOutputTokens
// Routing/format/exemplar config (all optional; defaults preserve current behaviour).
const GEN_CONFIG = { models: RAW_CONFIG.models, routing: RAW_CONFIG.routing }
const FORMATS = RAW_CONFIG.formats ?? []
const DEFAULT_FORMAT = RAW_CONFIG.defaultFormat ?? 'straight'
const EXEMPLARS = RAW_CONFIG.exemplars ?? { enabled: false, pool: [] }

// --- rate-limiting helpers ---

async function hashIp(ip: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(salt + ip)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function utcDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function secondsUntilEndOfUtcDay(): number {
  const now = new Date()
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  return Math.max(60, Math.ceil((end - now.getTime()) / 1000))
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'X-Content-Type-Options': 'nosniff',
    Vary: 'Origin',
  }
}

// Per-IP daily budget for the retrieval/search endpoints — a separate, more generous
// cap than the roast limit so these cannot be abused as an open scraping / API-key
// burning proxy. Returns a 429 Response when over budget, or null to proceed.
async function enforceRetrieveBudget(
  request: Request,
  env: Env,
  allowOrigin: string,
): Promise<Response | null> {
  const clientIp = request.headers.get('CF-Connecting-IP') ?? ''
  if (!clientIp) return null
  const limit = Number(env.RETRIEVE_DAILY_LIMIT) || 300
  const key = `rt:${utcDate()}:${await hashIp(clientIp, env.IP_HASH_SALT)}`
  const used = Number((await env.RATE_LIMIT.get(key)) ?? '0')
  if (used >= limit) {
    return jsonError('rate_limited', 'Daily lookup limit reached. Please try again tomorrow.', 429, allowOrigin)
  }
  await env.RATE_LIMIT.put(key, String(used + 1), { expirationTtl: secondsUntilEndOfUtcDay() })
  return null
}

function jsonError(
  error: string,
  message: string,
  status: number,
  origin: string,
): Response {
  return new Response(JSON.stringify({ error, message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  })
}

function intensityDirective(level: number): string {
  const found = INTENSITY_LEVELS.find((l) => l.level === level)
  return (found ?? INTENSITY_LEVELS[INTENSITY_LEVELS.length - 1]).directive
}

// Fill the roast.md template: the {{INTENSITY}} line, the {{FORMAT}} block (chosen
// comedic frame, or nothing), an optional {{EXEMPLAR}} (rotated per profile when
// enabled), and the {{EXCLUDE}} block (the user's confirmed mis-attributed works).
// Placeholder-filling and rotation live in generation.mjs (shared with the tests).
function buildSystemPrompt(
  intensity: number,
  exclude: string[] = [],
  formatKey: string = DEFAULT_FORMAT,
  profileSeed = '',
): string {
  const level = Math.min(MAX_INTENSITY, Math.max(MIN_INTENSITY, intensity))
  const excludeBlock = exclude.length
    ? [
        'The user has confirmed the following works are NOT by this researcher (mis-attributed by the data source). Treat this as authoritative: ignore these works completely — do not mention, reference, or roast them, and do not count them towards the researcher\'s output:',
        ...exclude.slice(0, 100).map((t) => `- ${t}`),
      ].join('\n')
    : ''
  const fmt = formatDirectiveFor(FORMATS, formatKey)
  const ex = pickExemplar(EXEMPLARS, hashString(profileSeed))
  return assemblePrompt(promptTemplate, {
    intensity: intensityLine(level, MAX_INTENSITY, intensityDirective(level)),
    exclude: excludeBlock,
    format: formatBlock(fmt.directive),
    exemplar: ex ? exemplarBlock(ex.text) : '',
  })
}

// --- ORCID login (OAuth authorization-code, session-only) ---
//
// Optional "Log in with ORCID": the minimal `/authenticate` scope returns only
// the iD (no private record data). We mint a short-lived, HMAC-signed token and
// hand it to the browser; nothing is persisted server-side. See the spec,
// Architecture → Account verification.

const SESSION_TTL_SECONDS = 12 * 60 * 60 // verified session lifetime
const STATE_TTL_SECONDS = 10 * 60 // window to complete the OAuth redirect round-trip

function b64urlEncode(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

// Compact signed token: base64url(JSON payload).base64url(HMAC-SHA256). The
// payload is readable by the client (it is not secret) but cannot be forged or
// altered without SESSION_SECRET; `exp` (epoch seconds) bounds its lifetime.
async function signToken(payload: object, secret: string): Promise<string> {
  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)))
  const key = await hmacKey(secret)
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return `${body}.${b64urlEncode(new Uint8Array(sig))}`
}

async function verifyToken(
  token: string,
  secret: string,
): Promise<Record<string, unknown> | null> {
  const dot = token.indexOf('.')
  if (dot < 1) return null
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const key = await hmacKey(secret)
  let ok: boolean
  try {
    ok = await crypto.subtle.verify(
      'HMAC',
      key,
      b64urlDecode(sig),
      new TextEncoder().encode(body),
    )
  } catch {
    return null
  }
  if (!ok) return null
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body)))
  } catch {
    return null
  }
  const exp = typeof payload.exp === 'number' ? payload.exp : 0
  if (!exp || exp < Math.floor(Date.now() / 1000)) return null
  return payload
}

function loginConfigured(env: Env): boolean {
  return Boolean(env.ORCID_CLIENT_ID && env.ORCID_CLIENT_SECRET && env.SESSION_SECRET)
}

function orcidBase(env: Env): string {
  return (env.ORCID_OAUTH_BASE || 'https://orcid.org').replace(/\/+$/, '')
}

// Redirect the browser back to the app, passing the result in a URL fragment the
// front end reads (and then strips). A fragment is never sent to any server.
function appRedirect(env: Env, fragment: string): Response {
  const base = env.APP_URL || env.ALLOW_ORIGIN || '/'
  return new Response(null, { status: 302, headers: { Location: `${base}#${fragment}` } })
}

function callbackUri(request: Request, env: Env): string {
  return env.ORCID_REDIRECT_URI || new URL('/auth/orcid/callback', request.url).toString()
}

async function handleAuthLogin(request: Request, env: Env): Promise<Response> {
  if (!loginConfigured(env)) return appRedirect(env, 'orcid_auth_error=login_disabled')
  const state = await signToken(
    {
      n: b64urlEncode(crypto.getRandomValues(new Uint8Array(16))),
      exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS,
    },
    env.SESSION_SECRET as string,
  )
  const auth = new URL(`${orcidBase(env)}/oauth/authorize`)
  auth.searchParams.set('client_id', env.ORCID_CLIENT_ID as string)
  auth.searchParams.set('response_type', 'code')
  auth.searchParams.set('scope', '/authenticate')
  auth.searchParams.set('redirect_uri', callbackUri(request, env))
  auth.searchParams.set('state', state)
  return new Response(null, { status: 302, headers: { Location: auth.toString() } })
}

async function handleAuthCallback(request: Request, env: Env): Promise<Response> {
  if (!loginConfigured(env)) return appRedirect(env, 'orcid_auth_error=login_disabled')
  const url = new URL(request.url)
  const code = url.searchParams.get('code') ?? ''
  const state = url.searchParams.get('state') ?? ''
  if (!code || !state) return appRedirect(env, 'orcid_auth_error=missing_code')
  // The state is self-verifying (signed + time-limited): rejects tampering/replay.
  if (!(await verifyToken(state, env.SESSION_SECRET as string))) {
    return appRedirect(env, 'orcid_auth_error=bad_state')
  }

  const form = new URLSearchParams({
    client_id: env.ORCID_CLIENT_ID as string,
    client_secret: env.ORCID_CLIENT_SECRET as string,
    grant_type: 'authorization_code',
    redirect_uri: callbackUri(request, env),
    code,
  })
  let tokenRes: Response
  try {
    tokenRes = await fetchWithTimeout(`${orcidBase(env)}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: form.toString(),
    })
  } catch {
    return appRedirect(env, 'orcid_auth_error=token_unreachable')
  }
  if (!tokenRes.ok) return appRedirect(env, 'orcid_auth_error=token_rejected')
  let data: { orcid?: string; name?: string }
  try {
    data = (await tokenRes.json()) as { orcid?: string; name?: string }
  } catch {
    return appRedirect(env, 'orcid_auth_error=bad_token_response')
  }
  if (!data.orcid) return appRedirect(env, 'orcid_auth_error=no_orcid')

  const session = await signToken(
    {
      orcid: data.orcid,
      name: data.name ?? null,
      exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    },
    env.SESSION_SECRET as string,
  )
  return appRedirect(env, `orcid_auth=${session}`)
}

async function handleAuthMe(
  request: Request,
  env: Env,
  allowOrigin: string,
): Promise<Response> {
  if (!loginConfigured(env)) {
    return jsonError('login_disabled', 'ORCID login is not configured.', 503, allowOrigin)
  }
  const auth = request.headers.get('Authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return jsonError('unauthorized', 'No session token.', 401, allowOrigin)
  const payload = await verifyToken(token, env.SESSION_SECRET as string)
  if (!payload) return jsonError('unauthorized', 'Invalid or expired session.', 401, allowOrigin)
  return new Response(JSON.stringify({ orcid: payload.orcid, name: payload.name ?? null }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(allowOrigin) },
  })
}

// --- structured-source retrieval (/retrieve) ---

async function handleRetrieve(
  request: Request,
  env: Env,
  allowOrigin: string,
): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonError('method_not_allowed', 'Use POST.', 405, allowOrigin)
  }
  if (!(request.headers.get('Content-Type') ?? '').includes('application/json')) {
    return jsonError('bad_request', 'Expected application/json.', 400, allowOrigin)
  }
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return jsonError('bad_request', 'Body is not valid JSON.', 400, allowOrigin)
  }
  const body = payload as { source?: unknown; id?: unknown; fresh?: unknown }
  const source = typeof body.source === 'string' ? body.source : ''
  const id = typeof body.id === 'string' ? body.id.trim() : ''
  const fresh = body.fresh === true
  if (!id) {
    return jsonError('bad_request', 'No identifier supplied.', 400, allowOrigin)
  }

  // Cache (018): public-record retrievals are cached in KV with a short TTL to cut
  // repeat external API calls, latency and usage-based cost. Only the assembled
  // public data is cached — never user-pasted/uploaded text and never the roast
  // (which is always generated fresh). Cache key is namespaced `rc:` (the daily
  // rate-limit counter uses `rl:`); identifiers are normalised to lower case.
  // `fresh: true` (used by the data export) skips the read so it reflects current
  // code/data, while still refreshing the cached copy below.
  const cacheKey = `rc:${source}:${id.toLowerCase()}`
  if (!fresh) {
    const cached = await env.RATE_LIMIT.get(cacheKey)
    if (cached) {
      return new Response(cached, {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT', ...corsHeaders(allowOrigin) },
      })
    }
  }

  // Throttle the external-fetch path. Cache hits above are free; only calls that do
  // real external work (or fresh:true) count against the per-IP daily budget.
  const over = await enforceRetrieveBudget(request, env, allowOrigin)
  if (over) return over

  let res: Response
  switch (source) {
    case 'github':
      res = await retrieveGithub(id, env, allowOrigin)
      break
    case 'orcid':
      res = await retrieveOrcid(id, env, allowOrigin)
      break
    case 'openalex':
      res = await retrieveOpenalex(id, env, allowOrigin)
      break
    case 'semanticscholar':
      res = await retrieveSemanticScholar(id, env, allowOrigin)
      break
    case 'dblp':
      res = await retrieveDblp(id, allowOrigin)
      break
    case 'website':
      res = await retrieveWebsite(id, env, allowOrigin)
      break
    default:
      return jsonError('bad_source', 'That source is not available yet.', 400, allowOrigin)
  }

  // Cache only successful retrievals; errors are never cached.
  if (res.status === 200) {
    const text = await res.clone().text()
    // A transiently-degraded enrichment is cached only briefly so it self-heals,
    // instead of poisoning the cache for a full day.
    const degraded = res.headers.get('X-Enrichment-Degraded') === '1'
    const ttl = degraded ? 300 : Number(env.RETRIEVE_CACHE_TTL) || 86400
    try {
      await env.RATE_LIMIT.put(cacheKey, text, { expirationTtl: ttl })
    } catch {
      // Caching is best-effort; a write failure must not fail the retrieval.
    }
    return new Response(text, {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-Cache': 'MISS', ...corsHeaders(allowOrigin) },
    })
  }
  return res
}

// --- Website / arbitrary URL retrieval ---
//
// A user can supply any web address (personal site, university or lab profile).
// The Worker fetches it and extracts readable text. Retrieval still goes through
// the Worker, never the browser. Guards below keep this from being used to probe
// internal/loopback/metadata addresses (SSRF) and cap cost.

// Reject hosts that should never be fetched: localhost, internal TLDs, and
// private/loopback/link-local/CGNAT/metadata IP literals.
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '')
  if (h === 'localhost' || h.endsWith('.localhost')) return true
  if (h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.lan')) return true
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (m) {
    const a = Number(m[1])
    const b = Number(m[2])
    if (a === 0 || a === 127 || a === 10) return true
    if (a === 169 && b === 254) return true // link-local incl. cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  }
  if (h === '::1' || h === '::') return true // loopback / unspecified
  if (/^(fc|fd|fe80)/i.test(h)) return true // IPv6 unique-local / link-local
  // IPv4-mapped (`::ffff:7f00:1`) and NAT64 (`64:ff9b::…`) embed an IPv4 in hex
  // after URL normalisation, so block the prefixes rather than dotted forms.
  if (/^(::ffff:(0:)?|64:ff9b:)/i.test(h)) return true
  return false
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      try {
        return String.fromCodePoint(parseInt(h, 16))
      } catch {
        return ''
      }
    })
    .replace(/&#(\d+);/g, (_, d) => {
      try {
        return String.fromCodePoint(Number(d))
      } catch {
        return ''
      }
    })
}

// Flatten HTML to readable text with string ops (the Worker has no DOM parser).
function htmlToText(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = titleMatch ? decodeEntities(titleMatch[1]).replace(/\s+/g, ' ').trim() : ''
  let body = html
    // Drop non-content blocks (and their contents) entirely.
    .replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    // Block-level closes and <br> become line breaks so structure survives.
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|header|footer)\s*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    // Strip all remaining tags.
    .replace(/<[^>]+>/g, ' ')
  body = decodeEntities(body)
    .replace(/[ \t\f\v\r]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { title, text: body }
}

// Same-site page links in an HTML document (skips anchors, mailto/tel, asset
// files, and off-host links). Used to crawl a personal site across its pages.
function sameSiteLinks(html: string, baseUrl: string): string[] {
  let host: string
  try {
    host = new URL(baseUrl).hostname.replace(/^www\./, '')
  } catch {
    return []
  }
  const out: string[] = []
  const re = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const href = m[1].trim()
    if (!href || /^(mailto:|tel:|javascript:|#)/i.test(href)) continue
    let u: URL
    try {
      u = new URL(href, baseUrl)
    } catch {
      continue
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') continue
    if (u.hostname.replace(/^www\./, '') !== host) continue
    if (
      /\.(pdf|docx?|pptx?|xlsx?|csv|zip|gz|rar|png|jpe?g|gif|svg|webp|avif|mp4|webm|mp3|wav|css|js|ico|woff2?|ttf)(\?|#|$)/i.test(
        u.pathname,
      )
    )
      continue
    u.hash = ''
    out.push(u.toString())
  }
  return out
}

// fetch() with a connect/headers deadline. The timer is cleared once the response
// headers arrive (in `finally`, before the caller reads the body), so it bounds only
// connection + time-to-first-byte — it never aborts a streaming body (e.g. the
// OpenRouter relay) or a slow body read. A thrown AbortError is handled by each call
// site's existing try/catch exactly like a network error.
async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  ms = 12000,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

// Read a response body as text, hard-capping the byte count even when Content-Length
// is absent or understated (chunked transfer) — closing the memory-spike vector on
// arbitrary user-supplied website bodies. Returns { overflow: true } when the cap is
// exceeded; a genuine read error throws (left to the caller to map).
async function readTextCapped(
  res: Response,
  limit: number,
): Promise<{ text: string } | { overflow: true }> {
  if (Number(res.headers.get('Content-Length') ?? '0') > limit) return { overflow: true }
  if (!res.body) return { text: await res.text() }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let total = 0
  let out = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > limit) {
        await reader.cancel().catch(() => {})
        return { overflow: true }
      }
      out += decoder.decode(value, { stream: true })
    }
    out += decoder.decode() // flush any trailing multi-byte sequence
    return { text: out }
  } finally {
    reader.cancel().catch(() => {})
  }
}

// Best-effort fetch of a single page's HTML (null on any failure / non-HTML /
// oversize). Used for the crawl's secondary pages; the seed uses detailed errors.
async function fetchPageHtml(target: string): Promise<string | null> {
  try {
    if (isBlockedHost(new URL(target).hostname)) return null
  } catch {
    return null
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 6000)
  try {
    const res = await fetch(target, {
      headers: {
        'User-Agent': 'roast-a-researcher (+https://github.com/eelkedevries/roast-a-researcher)',
        Accept: 'text/html,application/xhtml+xml,text/plain',
      },
      redirect: 'follow',
      signal: controller.signal,
    })
    if (!res.ok) return null
    // Redirects are followed; re-check the final host so a public URL can't bounce
    // us to an internal one (SSRF).
    try {
      if (isBlockedHost(new URL(res.url).hostname)) return null
    } catch {
      return null
    }
    if (!/text\/html|application\/xhtml|text\/plain/i.test(res.headers.get('Content-Type') ?? '')) {
      return null
    }
    const r = await readTextCapped(res, 5_000_000)
    if ('overflow' in r) return null
    return r.text
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function retrieveWebsite(
  input: string,
  env: Env,
  allowOrigin: string,
): Promise<Response> {
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`)
  } catch {
    return jsonError('invalid_identifier', 'That is not a valid web address.', 400, allowOrigin)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return jsonError('invalid_identifier', 'Only http(s) web addresses are supported.', 400, allowOrigin)
  }
  if (isBlockedHost(url.hostname)) {
    return jsonError('invalid_identifier', 'That address cannot be fetched.', 400, allowOrigin)
  }

  // Fetch the given page first, with detailed errors so a bad link reports clearly.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  let res: Response
  try {
    res = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'roast-a-researcher (+https://github.com/eelkedevries/roast-a-researcher)',
        Accept: 'text/html,application/xhtml+xml,text/plain',
      },
      redirect: 'follow',
      signal: controller.signal,
    })
  } catch {
    clearTimeout(timer)
    return jsonError('source_error', 'Could not reach that website (it may be slow or blocking requests).', 502, allowOrigin)
  }
  clearTimeout(timer)
  // Redirects are followed; re-check the final host so a public URL can't bounce
  // the crawl onto an internal address (SSRF).
  try {
    if (isBlockedHost(new URL(res.url).hostname)) {
      return jsonError('invalid_identifier', 'That address cannot be fetched.', 400, allowOrigin)
    }
  } catch {
    // A malformed final URL is treated as a fetch failure below.
  }
  if (!res.ok) {
    return jsonError('source_error', `That website returned an error (${res.status}).`, 502, allowOrigin)
  }
  if (!/text\/html|application\/xhtml|text\/plain/i.test(res.headers.get('Content-Type') ?? '')) {
    return jsonError('unsupported', 'That link is not a readable web page (HTML expected). Paste the text instead.', 415, allowOrigin)
  }
  let seedHtml: string | null
  try {
    const r = await readTextCapped(res, 5_000_000)
    if ('overflow' in r) {
      return jsonError('too_large', 'That page is too large to fetch. Paste the relevant text instead.', 413, allowOrigin)
    }
    seedHtml = r.text
  } catch {
    return jsonError('source_error', 'Could not read that website.', 502, allowOrigin)
  }

  // Crawl the rest of the site (same host): start from the given page and the site
  // root, following internal links (CV, media, etc.). Bounded by page count, a
  // per-page and total character budget, and an overall time deadline.
  const maxChars = Number(env.MAX_INPUT_CHARS) || 12000
  const TOTAL_BUDGET = Math.min(maxChars, 24000)
  const PER_PAGE = 6000
  const MAX_PAGES = 12
  const deadline = Date.now() + 20000
  const origin = `${url.protocol}//${url.host}`
  const pageKey = (u: string): string => {
    try {
      const x = new URL(u)
      return x.hostname.replace(/^www\./, '') + (x.pathname.replace(/\/+$/, '') || '/')
    } catch {
      return u
    }
  }
  const seen = new Set<string>()
  const queue: string[] = [url.toString()]
  if (pageKey(`${origin}/`) !== pageKey(url.toString())) queue.push(`${origin}/`)

  const pages: Array<{ url: string; title: string; text: string }> = []
  let total = 0
  while (queue.length && pages.length < MAX_PAGES && total < TOTAL_BUDGET && Date.now() < deadline) {
    const next = queue.shift() as string
    const key = pageKey(next)
    if (seen.has(key)) continue
    seen.add(key)

    let pageHtml: string | null
    if (seedHtml !== null && key === pageKey(url.toString())) {
      pageHtml = seedHtml
      seedHtml = null
    } else {
      pageHtml = await fetchPageHtml(next)
    }
    if (!pageHtml) continue

    const { title, text } = htmlToText(pageHtml)
    const slice = text.slice(0, PER_PAGE)
    if (slice.replace(/\s/g, '').length >= 30) {
      pages.push({ url: next, title, text: slice })
      total += slice.length
    }
    if (pages.length < MAX_PAGES) {
      for (const link of sameSiteLinks(pageHtml, next)) {
        if (!seen.has(pageKey(link))) queue.push(link)
      }
    }
  }

  if (!pages.length) {
    return jsonError(
      'not_found',
      'No readable text found on that site (it may be image-only or rendered by JavaScript). Paste the text instead.',
      404,
      allowOrigin,
    )
  }

  const header = `Website: ${pages[0].title || url.hostname} (${origin}) — ${pages.length} page${
    pages.length === 1 ? '' : 's'
  } retrieved`
  const body = pages.map((p) => `## ${p.title || p.url}\n${p.url}\n${p.text}`).join('\n\n')
  const out = `${header}\n\n${body}`.slice(0, TOTAL_BUDGET)
  return new Response(JSON.stringify({ text: out }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(allowOrigin) },
  })
}


function parseGithubUsername(input: string): string | null {
  let s = input.trim()
  const match = s.match(/github\.com\/([^/?#]+)/i)
  if (match) s = match[1]
  s = s.replace(/^@/, '')
  return /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})$/.test(s) ? s : null
}

async function retrieveGithub(
  input: string,
  env: Env,
  allowOrigin: string,
): Promise<Response> {
  const username = parseGithubUsername(input)
  if (!username) {
    return jsonError(
      'invalid_identifier',
      'That is not a valid GitHub username or URL.',
      400,
      allowOrigin,
    )
  }

  const headers: Record<string, string> = {
    'User-Agent': 'roast-a-researcher',
    Accept: 'application/vnd.github+json',
  }
  if (env.GITHUB_TOKEN) headers['Authorization'] = `Bearer ${env.GITHUB_TOKEN}`

  let profileRes: Response
  try {
    profileRes = await fetchWithTimeout(`https://api.github.com/users/${username}`, { headers })
  } catch {
    return jsonError('source_error', 'Could not reach GitHub.', 502, allowOrigin)
  }
  if (profileRes.status === 404) {
    return jsonError('not_found', 'No GitHub user with that name.', 404, allowOrigin)
  }
  // GitHub signals rate limiting as 403 (secondary limits) or 429 (primary).
  if (profileRes.status === 403 || profileRes.status === 429) {
    return jsonError('rate_limited', 'GitHub rate limit reached. Try again later.', 429, allowOrigin)
  }
  if (!profileRes.ok) {
    return jsonError('source_error', 'GitHub returned an error.', 502, allowOrigin)
  }

  const profile = (await profileRes.json()) as {
    login?: string
    name?: string
    bio?: string
    company?: string
    blog?: string
    location?: string
    public_repos?: number
    followers?: number
  }

  let repos: Array<{
    name?: string
    description?: string
    language?: string
    stargazers_count?: number
  }> = []
  try {
    const reposRes = await fetchWithTimeout(
      `https://api.github.com/users/${username}/repos?sort=pushed&per_page=10`,
      { headers },
    )
    if (reposRes.ok) repos = (await reposRes.json()) as typeof repos
  } catch {
    // Repos are optional flavour.
  }

  const lines: string[] = [
    `GitHub: ${profile.name ?? profile.login ?? username} (@${profile.login ?? username})`,
  ]
  if (profile.bio) lines.push(`Bio: ${profile.bio}`)
  if (profile.company) lines.push(`Company: ${profile.company}`)
  if (profile.location) lines.push(`Location: ${profile.location}`)
  if (profile.blog) lines.push(`Site: ${profile.blog}`)
  lines.push(
    `Public repos: ${profile.public_repos ?? 0}; followers: ${profile.followers ?? 0}`,
  )
  if (repos.length) {
    lines.push('Notable repositories:')
    for (const r of repos) {
      const lang = r.language ? `, ${r.language}` : ''
      const stars = r.stargazers_count ? `, ★${r.stargazers_count}` : ''
      lines.push(`- ${r.name ?? ''}${lang}${stars}${r.description ? `: ${r.description}` : ''}`)
    }
  }

  return new Response(JSON.stringify({ text: lines.join('\n') }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(allowOrigin) },
  })
}

// --- ORCID ---

// Validate an ORCID iD's check digit (ISO 7064 MOD 11-2 over the first 15 digits).
function orcidChecksumValid(digits: string): boolean {
  let total = 0
  for (let i = 0; i < 15; i++) {
    total = (total + Number(digits[i])) * 2
  }
  const remainder = total % 11
  const result = (12 - remainder) % 11
  const check = result === 10 ? 'X' : String(result)
  return check === digits[15].toUpperCase()
}

// Extract a canonical, checksum-valid ORCID iD from a bare iD or an orcid.org URL.
function parseOrcidId(input: string): string | null {
  const match = input.trim().match(/(\d{4}-\d{4}-\d{4}-\d{3}[\dxX])/)
  if (!match) return null
  const id = match[1].toUpperCase()
  return orcidChecksumValid(id.replace(/-/g, '')) ? id : null
}

function orcidDateRange(start: unknown, end: unknown): string {
  const year = (d: unknown): string | null => {
    const v = (d as { year?: { value?: string } } | null)?.year?.value
    return v ? String(v) : null
  }
  const from = year(start)
  const to = year(end)
  if (!from && !to) return ''
  return ` (${from ?? '?'}–${to ?? 'present'})`
}

async function retrieveOrcid(
  input: string,
  env: Env,
  allowOrigin: string,
): Promise<Response> {
  const id = parseOrcidId(input)
  if (!id) {
    return jsonError(
      'invalid_identifier',
      'That is not a valid ORCID iD or orcid.org URL.',
      400,
      allowOrigin,
    )
  }

  // The public record is readable with only an Accept header; a read-public
  // token is sent only when configured, to raise rate limits.
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'roast-a-researcher',
  }
  if (env.ORCID_TOKEN) headers['Authorization'] = `Bearer ${env.ORCID_TOKEN}`

  let res: Response
  try {
    res = await fetchWithTimeout(`https://pub.orcid.org/v3.0/${id}/record`, { headers })
  } catch {
    return jsonError('source_error', 'Could not reach ORCID.', 502, allowOrigin)
  }
  if (res.status === 404) {
    return jsonError('not_found', 'No ORCID record with that iD.', 404, allowOrigin)
  }
  if (!res.ok) {
    return jsonError('source_error', 'ORCID returned an error.', 502, allowOrigin)
  }

  type Affiliation = {
    'role-title'?: string | null
    'department-name'?: string | null
    organization?: { name?: string } | null
    'start-date'?: unknown
    'end-date'?: unknown
  }
  type Group = { summaries?: Array<Record<string, Affiliation>> }
  const record = (await res.json()) as {
    person?: {
      name?: {
        'credit-name'?: { value?: string } | null
        'given-names'?: { value?: string } | null
        'family-name'?: { value?: string } | null
      } | null
      biography?: { content?: string } | null
    }
    'activities-summary'?: {
      employments?: { 'affiliation-group'?: Group[] }
      educations?: { 'affiliation-group'?: Group[] }
      distinctions?: { 'affiliation-group'?: Group[] }
      fundings?: {
        group?: Array<{
          'funding-summary'?: Array<{
            title?: { title?: { value?: string } }
            organization?: { name?: string }
            type?: string
            'start-date'?: unknown
            'end-date'?: unknown
          }>
        }>
      }
      works?: {
        group?: Array<{
          'work-summary'?: Array<{
            title?: { title?: { value?: string } }
            'publication-date'?: { year?: { value?: string } } | null
            'external-ids'?: {
              'external-id'?: Array<{
                'external-id-type'?: string
                'external-id-value'?: string
              }>
            } | null
          }>
        }>
      }
    }
  }

  const name = record.person?.name
  const fullName = [name?.['given-names']?.value, name?.['family-name']?.value]
    .filter(Boolean)
    .join(' ')
  const displayName = name?.['credit-name']?.value || fullName || id

  const lines: string[] = [`ORCID: ${displayName} (${id})`]

  const bio = record.person?.biography?.content
  if (bio) lines.push(`Bio: ${bio.trim()}`)

  const affiliationLines = (groups: Group[] | undefined, key: string): string[] => {
    const out: string[] = []
    for (const group of groups ?? []) {
      for (const summary of group.summaries ?? []) {
        const a = summary[key]
        if (!a) continue
        const org = a.organization?.name ?? ''
        const role = a['role-title'] ?? ''
        const dept = a['department-name'] ? `, ${a['department-name']}` : ''
        const range = orcidDateRange(a['start-date'], a['end-date'])
        const text = [role, org].filter(Boolean).join(', ')
        if (text) out.push(`- ${text}${dept}${range}`)
      }
    }
    return out
  }

  const employment = affiliationLines(
    record['activities-summary']?.employments?.['affiliation-group'],
    'employment-summary',
  )
  if (employment.length) lines.push('Employment:', ...employment)

  const education = affiliationLines(
    record['activities-summary']?.educations?.['affiliation-group'],
    'education-summary',
  )
  if (education.length) lines.push('Education:', ...education)

  // Grants (fundings) and awards (distinctions) from the same public record.
  const funding: string[] = []
  for (const group of record['activities-summary']?.fundings?.group ?? []) {
    const f = group['funding-summary']?.[0]
    if (!f) continue
    const title = f.title?.title?.value ?? ''
    const org = f.organization?.name ?? ''
    const type = f.type ? ` [${f.type}]` : ''
    const range = orcidDateRange(f['start-date'], f['end-date'])
    const text = [title, org].filter(Boolean).join(' — ')
    if (text) funding.push(`- ${text}${type}${range}`)
    if (funding.length >= 15) break
  }
  if (funding.length) lines.push('Funding:', ...funding)

  const awards = affiliationLines(
    record['activities-summary']?.distinctions?.['affiliation-group'],
    'distinction-summary',
  )
  if (awards.length) lines.push('Awards:', ...awards)

  const titles: string[] = []
  const orcidPapers: ApiPaper[] = []
  for (const group of record['activities-summary']?.works?.group ?? []) {
    const ws = group['work-summary']?.[0]
    const title = ws?.title?.title?.value
    if (!title) continue
    if (titles.length < 15) titles.push(title.trim())
    if (orcidPapers.length < 100) {
      const year = Number(ws?.['publication-date']?.year?.value) || null
      let doi: string | null = null
      for (const eid of ws?.['external-ids']?.['external-id'] ?? []) {
        if ((eid['external-id-type'] ?? '').toLowerCase() === 'doi') {
          doi = normDoi(eid['external-id-value'])
          break
        }
      }
      orcidPapers.push({ title: title.trim(), year, venue: null, citations: null, doi })
    }
  }
  if (titles.length) {
    lines.push('Selected works:')
    for (const t of titles) lines.push(`- ${t}`)
  }

  // Auto-resolve the OpenAlex profile from the ORCID iD (uses the OpenAlex API
  // key), so citation metrics, the stats card, and charts appear from an ORCID
  // alone — without separately adding an OpenAlex link. Skipped if no key/budget.
  let stats: OpenAlexResult['stats'] | undefined
  let charts: OpenAlexResult['charts']
  let oaPapers: ApiPaper[] = []
  // True when enrichment failed transiently (HTTP/network/retrieval error), so the
  // caller caches this degraded result only briefly instead of for a full day.
  let degraded = false
  try {
    const oaHeaders = { Accept: 'application/json', 'User-Agent': 'roast-a-researcher' }
    const lookup = await fetchWithTimeout(
      openalexUrl('authors', env, { filter: `orcid:${id}`, 'per-page': '1' }),
      { headers: oaHeaders },
    )
    if (!lookup.ok) {
      degraded = true
      lines.push('', `(OpenAlex enrichment unavailable: HTTP ${lookup.status}.)`)
    } else {
      const data = (await lookup.json()) as { results?: Array<{ id?: string }> }
      const oaId = data.results?.[0]?.id ? parseOpenalexId(data.results[0].id) : null
      if (!oaId) {
        lines.push('', '(No OpenAlex profile matched this ORCID.)')
      } else {
        const oa = await buildOpenalex(oaId, env, oaHeaders)
        if (oa) {
          lines.push('', oa.text)
          stats = oa.stats
          charts = oa.charts
          oaPapers = oa.papers
        } else {
          degraded = true
          lines.push('', '(OpenAlex profile found but could not be retrieved.)')
        }
      }
    }
  } catch {
    degraded = true
    lines.push('', '(OpenAlex enrichment skipped: network error.)')
  }

  const responseHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...corsHeaders(allowOrigin),
  }
  // Out-of-band signal so handleRetrieve can under-cache a transient failure.
  if (degraded) responseHeaders['X-Enrichment-Degraded'] = '1'
  return new Response(
    JSON.stringify({ text: lines.join('\n'), stats, charts, papers: [...orcidPapers, ...oaPapers] }),
    { status: 200, headers: responseHeaders },
  )
}

// --- OpenAlex ---

// Extract a canonical OpenAlex author id (e.g. A5023888391) from a bare id or an
// openalex.org / api.openalex.org URL.
function parseOpenalexId(input: string): string | null {
  const match = input.trim().match(/A\d{5,}/i)
  return match ? `A${match[0].slice(1)}` : null
}

// Build an OpenAlex API URL, appending the API key only when one is configured.
// OpenAlex uses usage-based pricing (re-verified 2026-06-07): anonymous requests
// get a $0 budget and 429, so a key is required. API keys are free with $1/day of
// free usage; it is sent on every request via the `api_key` parameter.
function openalexUrl(path: string, env: Env, params: Record<string, string> = {}): string {
  const url = new URL(`https://api.openalex.org/${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  // OpenAlex uses usage-based pricing: the (free) API key carries the $1/day
  // budget and is required — without it requests are rejected. The `mailto`
  // param is a harmless leftover from the retired "polite pool" era.
  if (env.OPENALEX_MAILTO) url.searchParams.set('mailto', env.OPENALEX_MAILTO)
  if (env.OPENALEX_API_KEY) url.searchParams.set('api_key', env.OPENALEX_API_KEY)
  return url.toString()
}

// Semantic Scholar request headers. The optional S2_API_KEY raises the rate
// limit to a per-key allowance — the shared unauthenticated pool is small and
// often throttled, so set the (free) key when 429s appear.
function s2Headers(env: Env): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'roast-a-researcher',
  }
  if (env.S2_API_KEY) headers['x-api-key'] = env.S2_API_KEY
  return headers
}

interface OpenAlexWork {
  citations: number
  year: number | null
  title: string
  fwci: number | null
  percentile: number | null
}

// Field-weighted citation impact across works: OpenAlex's native per-work `fwci`
// when present, else approximated from the citation percentile (value / 50, where
// 1.0 ≈ world average). Null when no work carries either field.
function meanFwci(works: OpenAlexWork[]): number | null {
  const vals: number[] = []
  for (const w of works) {
    if (w.fwci != null) vals.push(w.fwci)
    else if (w.percentile != null) vals.push(w.percentile / 50)
  }
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
}

interface OpenAlexGroup {
  key: string
  count: number
  display: string
}

// Fetch an OpenAlex group_by aggregation over an author's works, or null on any
// failure (enrichment then degrades silently).
async function openalexGroupBy(
  id: string,
  dimension: string,
  env: Env,
  headers: Record<string, string>,
): Promise<OpenAlexGroup[] | null> {
  try {
    const res = await fetchWithTimeout(
      openalexUrl('works', env, { filter: `author.id:${id}`, group_by: dimension }),
      { headers },
    )
    if (!res.ok) return null
    const data = (await res.json()) as {
      group_by?: Array<{ key?: string; count?: number; key_display_name?: string }>
    }
    return (data.group_by ?? []).map((g) => ({
      key: g.key ?? '',
      count: g.count ?? 0,
      display: g.key_display_name ?? g.key ?? '',
    }))
  } catch {
    return null
  }
}

// Open-access breakdown and collaboration-geography lines (019), from already
// fetched group_by aggregations (so the same fetch feeds the charts — 025 — too).
// Each line is omitted when its aggregation is missing or empty.
function openalexEnrichment(
  oa: OpenAlexGroup[] | null,
  countries: OpenAlexGroup[] | null,
): string[] {
  const lines: string[] = []

  if (oa && oa.length) {
    const counts: Record<string, number> = {}
    let total = 0
    for (const g of oa) {
      counts[g.key] = g.count
      total += g.count
    }
    if (total > 0) {
      const closed = counts['closed'] ?? 0
      const pct = Math.round(((total - closed) / total) * 100)
      const order = ['gold', 'green', 'hybrid', 'bronze', 'diamond', 'closed']
      const parts = order
        .filter((k) => counts[k])
        .map((k) => `${k} ${counts[k]}`)
      lines.push(`Open access: ${pct}% open (${parts.join(', ')})`)
    }
  }

  if (countries && countries.length) {
    const codes = countries
      .map((g) => g.key)
      .filter((k) => /^[A-Za-z]{2}$/.test(k))
    const continents = new Set<string>()
    for (const code of codes) {
      const c = continentOf(code)
      if (c) continents.add(c)
    }
    if (codes.length) {
      lines.push(
        `Collaboration geography: institutions in ${codes.length} ` +
          `${codes.length === 1 ? 'country' : 'countries'} across ${continents.size} ` +
          `${continents.size === 1 ? 'continent' : 'continents'}`,
      )
    }
  }

  return lines
}

// Reconstruct an abstract from OpenAlex's inverted index ({ word: [positions] }).
function abstractFromInvertedIndex(
  idx: Record<string, number[]> | null | undefined,
): string {
  if (!idx) return ''
  const words: string[] = []
  for (const [word, positions] of Object.entries(idx)) {
    for (const p of positions) words[p] = word
  }
  return words.filter((w) => w !== undefined).join(' ').trim()
}

// A paper as returned to the front end by any structured source, for the
// cross-platform merge/de-dupe (038). DOI is normalised (bare, lower-case) so the
// same work from different sources collapses to one entry.
interface ApiPaper {
  title: string
  year: number | null
  venue: string | null
  citations: number | null
  doi: string | null
}

function normDoi(doi: string | null | undefined): string | null {
  if (!doi) return null
  const d = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').trim().toLowerCase()
  return d || null
}

// A lighter, larger works fetch (no abstracts) for the combined Papers list.
async function openalexPapers(
  id: string,
  env: Env,
  headers: Record<string, string>,
  limit: number,
): Promise<ApiPaper[]> {
  try {
    const res = await fetchWithTimeout(
      openalexUrl('works', env, {
        filter: `author.id:${id}`,
        'per-page': String(limit),
        sort: 'cited_by_count:desc',
        select: 'title,publication_year,cited_by_count,doi,primary_location',
      }),
      { headers },
    )
    if (!res.ok) return []
    const data = (await res.json()) as {
      results?: Array<{
        title?: string
        publication_year?: number
        cited_by_count?: number
        doi?: string | null
        primary_location?: { source?: { display_name?: string } | null } | null
      }>
    }
    return (data.results ?? [])
      .filter((w) => w.title)
      .map((w) => ({
        title: (w.title ?? '').trim(),
        year: w.publication_year ?? null,
        venue: w.primary_location?.source?.display_name ?? null,
        citations: w.cited_by_count ?? null,
        doi: normDoi(w.doi),
      }))
  } catch {
    return []
  }
}

interface OpenAlexRichWork {
  title: string
  year: number | null
  citations: number
  venue: string
  abstract: string
  journalCitedness: number | null
  sourceId: string | null
  doi: string | null
}

// Top works with venue and abstract, for the detailed roast material. Kept small
// (the lean 200-work fetch feeds the metrics); abstracts are the bulky field, so
// only these few are pulled with them.
async function openalexTopWorks(
  id: string,
  env: Env,
  headers: Record<string, string>,
  limit: number,
): Promise<OpenAlexRichWork[]> {
  try {
    const res = await fetchWithTimeout(
      openalexUrl('works', env, {
        filter: `author.id:${id}`,
        'per-page': String(limit),
        sort: 'cited_by_count:desc',
        select: 'title,publication_year,cited_by_count,doi,primary_location,abstract_inverted_index',
      }),
      { headers },
    )
    if (!res.ok) return []
    const data = (await res.json()) as {
      results?: Array<{
        title?: string
        publication_year?: number
        cited_by_count?: number
        doi?: string | null
        primary_location?: {
          source?: {
            id?: string
            display_name?: string
            summary_stats?: { '2yr_mean_citedness'?: number } | null
          } | null
        } | null
        abstract_inverted_index?: Record<string, number[]>
      }>
    }
    return (data.results ?? []).map((w) => ({
      title: w.title ?? '',
      year: w.publication_year ?? null,
      citations: w.cited_by_count ?? 0,
      venue: w.primary_location?.source?.display_name ?? '',
      abstract: abstractFromInvertedIndex(w.abstract_inverted_index),
      journalCitedness: w.primary_location?.source?.summary_stats?.['2yr_mean_citedness'] ?? null,
      sourceId: w.primary_location?.source?.id ?? null,
      doi: w.doi ? w.doi.replace(/^https?:\/\/doi\.org\//i, '').toLowerCase() : null,
    }))
  } catch {
    return []
  }
}

// Percentile rank of a value within a cited_by_count group_by distribution:
// proportion of papers with fewer citations, plus half of those with equal.
function percentileInDistribution(value: number, groups: OpenAlexGroup[]): number | null {
  let fewer = 0
  let equal = 0
  let total = 0
  for (const g of groups) {
    const c = Number(g.key)
    if (!Number.isFinite(c)) continue
    total += g.count
    if (c < value) fewer += g.count
    else if (c === value) equal += g.count
  }
  return total > 0 ? ((fewer + 0.5 * equal) / total) * 100 : null
}

// p-index (022): the mean percentile rank of the top works within their
// journal-and-year cohort. Bounded to a few cohort lookups so a single retrieval
// stays cheap. Null when no cohort can be resolved.
async function openalexPIndex(
  works: OpenAlexRichWork[],
  env: Env,
  headers: Record<string, string>,
): Promise<number | null> {
  // Capped at 3 cohort lookups: each is a separate OpenAlex request, so this
  // bounds both latency and usage-based cost.
  const usable = works.filter((w) => w.sourceId && w.year != null).slice(0, 3)
  const percentiles: number[] = []
  for (const w of usable) {
    const sid = w.sourceId?.match(/S\d+/)?.[0]
    if (!sid) continue
    try {
      const res = await fetchWithTimeout(
        openalexUrl('works', env, {
          filter: `primary_location.source.id:${sid},publication_year:${w.year}`,
          group_by: 'cited_by_count',
        }),
        { headers },
      )
      if (!res.ok) continue
      const data = (await res.json()) as { group_by?: Array<{ key?: string; count?: number }> }
      const groups = (data.group_by ?? []).map((g) => ({
        key: g.key ?? '',
        count: g.count ?? 0,
        display: '',
      }))
      const p = percentileInDistribution(w.citations, groups)
      if (p != null) percentiles.push(p)
    } catch {
      // Skip this cohort; the p-index degrades to the cohorts that resolved.
    }
  }
  return percentiles.length
    ? percentiles.reduce((a, b) => a + b, 0) / percentiles.length
    : null
}

interface S2Enrichment {
  influential: number | null
  tldr: string | null
}

// Semantic Scholar enrichment (023): keyless batch lookup of the top works' DOIs
// for influential-citation counts and TLDR summaries. Returns a map keyed by bare
// lowercase DOI; degrades to an empty map on any failure or rate limit.
async function semanticScholarByDoi(
  dois: string[],
  env: Env,
): Promise<Map<string, S2Enrichment>> {
  const out = new Map<string, S2Enrichment>()
  if (!dois.length) return out
  try {
    const res = await fetchWithTimeout(
      'https://api.semanticscholar.org/graph/v1/paper/batch?fields=externalIds,influentialCitationCount,tldr',
      {
        method: 'POST',
        headers: { ...s2Headers(env), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: dois.map((d) => `DOI:${d}`) }),
      },
    )
    if (!res.ok) return out
    const data = (await res.json()) as Array<{
      externalIds?: { DOI?: string } | null
      influentialCitationCount?: number | null
      tldr?: { text?: string } | null
    } | null>
    for (const paper of data) {
      const doi = paper?.externalIds?.DOI?.toLowerCase()
      if (!doi) continue
      out.set(doi, {
        influential: paper?.influentialCitationCount ?? null,
        tldr: paper?.tldr?.text ?? null,
      })
    }
  } catch {
    // Keyless best-effort enrichment; absence is fine.
  }
  return out
}

interface Coauthor {
  name: string
  institution: string | null
  count: number
}

// Frequent named co-authors (024) and collaboration geography, both from the
// subject's works' authorships in a single fetch. Co-authors are tallied by
// OpenAlex author id (excluding the subject); countries are tallied from the
// authorship institutions' country codes (reliable, unlike a country group_by).
async function openalexCoauthors(
  id: string,
  env: Env,
  headers: Record<string, string>,
  limit: number,
): Promise<{ coauthors: Coauthor[]; countries: OpenAlexGroup[] }> {
  try {
    const res = await fetchWithTimeout(
      openalexUrl('works', env, {
        filter: `author.id:${id}`,
        'per-page': '200',
        sort: 'cited_by_count:desc',
        select: 'authorships',
      }),
      { headers },
    )
    if (!res.ok) return { coauthors: [], countries: [] }
    const data = (await res.json()) as {
      results?: Array<{
        authorships?: Array<{
          author?: { id?: string; display_name?: string }
          institutions?: Array<{ display_name?: string; country_code?: string }>
        }>
      }>
    }
    const tally = new Map<string, Coauthor>()
    const countryTally = new Map<string, number>()
    for (const work of data.results ?? []) {
      for (const a of work.authorships ?? []) {
        for (const inst of a.institutions ?? []) {
          const cc = inst.country_code?.toUpperCase()
          if (cc && /^[A-Z]{2}$/.test(cc)) countryTally.set(cc, (countryTally.get(cc) ?? 0) + 1)
        }
        const aid = a.author?.id?.match(/A\d+/)?.[0]
        if (!aid || aid === id) continue
        const existing = tally.get(aid)
        if (existing) existing.count += 1
        else
          tally.set(aid, {
            name: a.author?.display_name ?? aid,
            institution: a.institutions?.[0]?.display_name ?? null,
            count: 1,
          })
      }
    }
    const coauthors = [...tally.values()]
      .filter((c) => c.count >= 2)
      .sort((x, y) => y.count - x.count)
      .slice(0, limit)
    const countries: OpenAlexGroup[] = [...countryTally.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => ({ key, count, display: countryName(key) }))
    return { coauthors, countries }
  } catch {
    return { coauthors: [], countries: [] }
  }
}

// Chart-ready series (025) from the author's counts_by_year plus the already
// fetched open-access, country and venue group_by aggregations (shared with the
// enrichment lines, so each aggregation is fetched once). Non-empty series only.
function openalexChartData(
  countsByYear: Array<{ year?: number; works_count?: number; cited_by_count?: number }>,
  oa: OpenAlexGroup[] | null,
  countries: OpenAlexGroup[] | null,
  venues: OpenAlexGroup[] | null,
): Record<string, unknown> | undefined {
  const charts: Record<string, unknown> = {}

  const years = [...countsByYear]
    .filter((c) => c.year != null)
    .sort((a, b) => (a.year ?? 0) - (b.year ?? 0))
  const worksPerYear = years.map((c) => ({ year: c.year, value: c.works_count ?? 0 }))
  const citationsPerYear = years.map((c) => ({ year: c.year, value: c.cited_by_count ?? 0 }))
  if (worksPerYear.length) charts.worksPerYear = worksPerYear
  if (citationsPerYear.length) charts.citationsPerYear = citationsPerYear

  if (oa && oa.length) {
    charts.openAccess = oa.map((g) => ({ status: g.key, count: g.count }))
  }
  if (countries && countries.length) {
    charts.topCountries = countries
      .filter((g) => /^[A-Za-z]{2}$/.test(g.key))
      .slice(0, 10)
      .map((g) => ({ country: g.display || g.key, count: g.count }))
  }
  if (venues && venues.length) {
    charts.topVenues = venues
      .filter((g) => g.key && g.display && g.key !== 'unknown')
      .slice(0, 10)
      .map((g) => ({ venue: g.display, count: g.count }))
  }

  return Object.keys(charts).length ? charts : undefined
}

interface OpenAlexResult {
  text: string
  stats: { source: string; title: string; entries: Array<{ label: string; value: string }> }
  charts: Record<string, unknown> | undefined
  papers: ApiPaper[]
}

// Builds the full OpenAlex result (roast text + stats + chart data) for a known
// author id, or null when the author cannot be fetched. Used directly by the
// OpenAlex /retrieve path and reused to auto-resolve OpenAlex from an ORCID iD.
async function buildOpenalex(
  id: string,
  env: Env,
  headers: Record<string, string>,
): Promise<OpenAlexResult | null> {
  let authorRes: Response
  try {
    authorRes = await fetchWithTimeout(openalexUrl(`authors/${id}`, env), { headers })
  } catch {
    return null
  }
  if (!authorRes.ok) return null

  const author = (await authorRes.json()) as {
    display_name?: string
    works_count?: number
    cited_by_count?: number
    summary_stats?: { h_index?: number; i10_index?: number }
    last_known_institutions?: Array<{ display_name?: string }>
    affiliations?: Array<{ institution?: { display_name?: string } }>
    counts_by_year?: Array<{ year?: number; works_count?: number; cited_by_count?: number }>
  }

  // Works, most-cited first, carrying per-paper citations and year for the
  // metrics computation (016) and enrichment (019).
  let works: OpenAlexWork[] = []
  try {
    const worksRes = await fetchWithTimeout(
      openalexUrl('works', env, {
        filter: `author.id:${id}`,
        'per-page': '200',
        sort: 'cited_by_count:desc',
        select: 'title,publication_year,cited_by_count,fwci,cited_by_percentile_year',
      }),
      { headers },
    )
    if (worksRes.ok) {
      const data = (await worksRes.json()) as {
        results?: Array<{
          title?: string
          publication_year?: number
          cited_by_count?: number
          fwci?: number | null
          cited_by_percentile_year?: { value?: number } | null
        }>
      }
      works = (data.results ?? []).map((w) => ({
        citations: w.cited_by_count ?? 0,
        year: w.publication_year ?? null,
        title: w.title ?? '',
        fwci: w.fwci ?? null,
        percentile: w.cited_by_percentile_year?.value ?? null,
      }))
    }
  } catch {
    // Works are optional; metrics simply degrade when absent.
  }

  const affiliation =
    author.last_known_institutions?.[0]?.display_name ??
    author.affiliations?.[0]?.institution?.display_name

  const lines: string[] = [`OpenAlex: ${author.display_name ?? id} (${id})`]
  if (affiliation) lines.push(`Affiliation: ${affiliation}`)
  // cited_by_count is total citations, not an h-index; the two are distinct fields.
  lines.push(
    `Works: ${author.works_count ?? 0}; total citations: ${author.cited_by_count ?? 0}; ` +
      `h-index: ${author.summary_stats?.h_index ?? 'n/a'}; ` +
      `i10-index: ${author.summary_stats?.i10_index ?? 'n/a'}`,
  )

  // Citation metrics computed from the retrieved works (016), giving the model
  // concrete numbers to roast. Omitted cleanly when no works were returned.
  const metrics = metricsSummary(works, new Date().getUTCFullYear())
  if (metrics) lines.push(metrics)

  // Fetch the open-access and venue aggregations once (shared between the
  // enrichment lines and the charts). Co-authors and collaboration geography come
  // from a single authorships fetch below.
  const [oaGroups, venueGroups] = await Promise.all([
    openalexGroupBy(id, 'open_access.oa_status', env, headers),
    openalexGroupBy(id, 'primary_location.source.id', env, headers),
  ])
  const { coauthors, countries: countryGroups } = await openalexCoauthors(id, env, headers, 8)

  // Open-access breakdown and collaboration geography (019).
  for (const line of openalexEnrichment(oaGroups, countryGroups)) lines.push(line)

  // Frequent named co-authors (024), beyond the country/continent counts above.
  if (coauthors.length) {
    lines.push('Frequent co-authors:')
    for (const c of coauthors) {
      const inst = c.institution ? ` (${c.institution})` : ''
      lines.push(`- ${c.name}${inst} — ${c.count} shared papers`)
    }
  }

  // Field-normalised impact (021): field-weighted citation impact across works,
  // and the mean citedness of the journals published in (an impact-factor proxy).
  const fwci = meanFwci(works)
  if (fwci != null) {
    lines.push(`Field-weighted citation impact (FWCI): ${fwci.toFixed(2)} (1.0 = world average)`)
  }

  // Detailed top works (venue + abstract) give the model concrete material —
  // titles, where they appeared, and what they were about — to roast.
  const ABSTRACT_CHARS = 320
  const topWorks = (await openalexTopWorks(id, env, headers, 8)).filter((w) => w.title)
  // A wider list (no abstracts) feeds the cross-source Papers merge (038).
  const papers = await openalexPapers(id, env, headers, 200)

  const citedness = topWorks
    .map((w) => w.journalCitedness)
    .filter((v): v is number => v != null)
  const meanCitedness = citedness.length
    ? citedness.reduce((a, b) => a + b, 0) / citedness.length
    : null
  if (meanCitedness != null) {
    lines.push(`Mean journal citedness (≈ impact factor): ${meanCitedness.toFixed(2)}`)
  }

  // p-index (022): mean journal-year citation percentile of the top works.
  const pIndex = await openalexPIndex(topWorks, env, headers)
  if (pIndex != null) {
    lines.push(`p-index (mean journal-year citation percentile): ${pIndex.toFixed(0)} of 100`)
  }
  // Semantic Scholar enrichment (023) for the top works that carry a DOI.
  const s2 = await semanticScholarByDoi(
    topWorks.map((w) => w.doi).filter((d): d is string => !!d),
    env,
  )

  if (topWorks.length) {
    lines.push('Most-cited works:')
    for (const w of topWorks) {
      const meta = [w.year, w.venue].filter(Boolean).join(', ')
      lines.push(`- "${w.title}"${meta ? ` (${meta})` : ''} — cited ${w.citations}`)
      if (w.abstract) {
        const a =
          w.abstract.length > ABSTRACT_CHARS
            ? `${w.abstract.slice(0, ABSTRACT_CHARS)}…`
            : w.abstract
        lines.push(`  Abstract: ${a}`)
      }
      const enrich = w.doi ? s2.get(w.doi) : undefined
      if (enrich?.influential != null) {
        lines.push(`  Influential citations: ${enrich.influential}`)
      }
      if (enrich?.tldr) lines.push(`  TL;DR: ${enrich.tldr}`)
    }
  }

  // Structured basic stats for the front-end card. Authoritative author totals
  // where available; g-index is computed from the works list.
  const m = computeMetrics(works, new Date().getUTCFullYear())
  const meanPerPaper =
    author.works_count && author.cited_by_count != null
      ? author.cited_by_count / author.works_count
      : m.mean
  const stats = {
    source: 'openalex',
    title: `${author.display_name ?? id} — OpenAlex`,
    entries: [
      { label: 'Publications', value: String(author.works_count ?? m.count) },
      { label: 'Citations', value: String(author.cited_by_count ?? m.total) },
      { label: 'h-index', value: String(author.summary_stats?.h_index ?? m.h) },
      { label: 'i10-index', value: String(author.summary_stats?.i10_index ?? m.i10) },
      { label: 'g-index', value: String(m.g) },
      { label: 'Mean citations', value: meanPerPaper.toFixed(1) },
      ...(fwci != null ? [{ label: 'FWCI', value: fwci.toFixed(2) }] : []),
      ...(meanCitedness != null
        ? [{ label: 'Journal citedness', value: meanCitedness.toFixed(2) }]
        : []),
      ...(pIndex != null ? [{ label: 'p-index', value: pIndex.toFixed(0) }] : []),
    ],
  }

  // Structured, chart-ready series for the front-end plots (025).
  const charts = openalexChartData(
    author.counts_by_year ?? [],
    oaGroups,
    countryGroups,
    venueGroups,
  )

  // Trend analysis (026): factual observations over the per-year series, folded
  // into the roast input so the model can roast the trajectory of a career.
  const yearPoints: YearPoint[] = (author.counts_by_year ?? [])
    .filter((c) => c.year != null)
    .map((c) => ({
      year: c.year as number,
      works: c.works_count ?? 0,
      citations: c.cited_by_count ?? 0,
    }))
  const dominantVenue =
    (charts?.topVenues as Array<{ venue?: string }> | undefined)?.[0]?.venue ?? null
  const trends = trendSummary(yearPoints, dominantVenue)
  if (trends.length) lines.push('Trends:', ...trends)

  return { text: lines.join('\n'), stats, charts, papers }
}

// OpenAlex /retrieve: validate the id, build the result, wrap as a Response.
// --- DBLP (029): computer-science bibliography ---

// Minimal XML entity decode for DBLP titles/venues (Workers have no DOM parser).
function unescapeXml(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .trim()
}

// Extract a DBLP person id (pid) from a dblp.org URL or a bare pid (e.g. 65/3603,
// l/EelkeDeVries).
function parseDblpPid(input: string): string | null {
  const s = input.trim()
  const m = s.match(/dblp\.org\/pid\/([^?#]+?)(?:\.\w+)?$/i)
  if (m) return m[1]
  if (/^[a-z0-9]{1,4}\/[A-Za-z0-9:_-]+$/i.test(s)) return s
  return null
}

async function retrieveDblp(input: string, allowOrigin: string): Promise<Response> {
  const pid = parseDblpPid(input)
  if (!pid) {
    return jsonError('invalid_identifier', 'That is not a valid DBLP author id or URL.', 400, allowOrigin)
  }
  const headers = { Accept: 'application/xml', 'User-Agent': 'roast-a-researcher' }
  let res: Response
  try {
    res = await fetchWithTimeout(`https://dblp.org/pid/${pid}.xml`, { headers })
  } catch {
    return jsonError('source_error', 'Could not reach DBLP.', 502, allowOrigin)
  }
  if (res.status === 404) {
    return jsonError('not_found', 'No DBLP author with that id.', 404, allowOrigin)
  }
  if (!res.ok) {
    return jsonError('source_error', `DBLP returned an error (HTTP ${res.status}).`, 502, allowOrigin)
  }
  const xml = await res.text()
  const name = xml.match(/<dblpperson[^>]*\sname="([^"]+)"/)?.[1] ?? pid

  // Each publication is wrapped in <r>…</r>; pull title, year, venue and DOI.
  type Pub = { title: string; year: number | null; venue: string; doi: string | null }
  const pubs: Pub[] = []
  for (const rec of xml.split('<r>').slice(1)) {
    const title = rec.match(/<title>([\s\S]*?)<\/title>/)?.[1]
    if (!title) continue
    const year = rec.match(/<year>(\d{4})<\/year>/)?.[1]
    const venue = rec.match(/<(?:journal|booktitle)>([\s\S]*?)<\/(?:journal|booktitle)>/)?.[1]
    const ee = rec.match(/<ee[^>]*>([\s\S]*?)<\/ee>/)?.[1]
    pubs.push({
      title: unescapeXml(title),
      year: year ? Number(year) : null,
      venue: venue ? unescapeXml(venue) : '',
      doi: ee ? normDoi(unescapeXml(ee).match(/doi\.org\/(.+)$/i)?.[1]) : null,
    })
  }
  pubs.sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
  const papers: ApiPaper[] = pubs.slice(0, 100).map((p) => ({
    title: p.title,
    year: p.year,
    venue: p.venue || null,
    citations: null,
    doi: p.doi,
  }))

  const lines: string[] = [`DBLP: ${unescapeXml(name)} (${pid})`, `Publications listed: ${pubs.length}`]
  const top = pubs.slice(0, 25)
  if (top.length) {
    lines.push('Recent publications:')
    for (const p of top) {
      const meta = [p.venue, p.year].filter(Boolean).join(', ')
      lines.push(`- "${p.title}"${meta ? ` (${meta})` : ''}`)
    }
  }
  return new Response(JSON.stringify({ text: lines.join('\n'), papers }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(allowOrigin) },
  })
}

async function searchDblp(query: string, allowOrigin: string): Promise<Response> {
  const headers = { Accept: 'application/json', 'User-Agent': 'roast-a-researcher' }
  let res: Response
  try {
    res = await fetchWithTimeout(
      `https://dblp.org/search/author/api?q=${encodeURIComponent(query)}&format=json&h=5`,
      { headers },
    )
  } catch {
    return jsonError('source_error', 'Could not reach DBLP.', 502, allowOrigin)
  }
  if (!res.ok) {
    return jsonError('source_error', `DBLP search failed (HTTP ${res.status}).`, 502, allowOrigin)
  }
  const data = (await res.json()) as {
    result?: { hits?: { hit?: Array<{ info?: { author?: string; url?: string; notes?: unknown } }> | { info?: { author?: string; url?: string } } } }
  }
  const raw = data.result?.hits?.hit
  const hits = Array.isArray(raw) ? raw : raw ? [raw] : []
  const list: Candidate[] = []
  for (const h of hits) {
    const pid = h.info?.url ? parseDblpPid(h.info.url) : null
    if (!pid || !h.info?.author) continue
    list.push({ id: pid, name: h.info.author, affiliation: null })
  }
  return candidates(list, allowOrigin)
}

// Semantic Scholar as a first-class source (028): author profile + top papers.
async function retrieveSemanticScholar(
  input: string,
  env: Env,
  allowOrigin: string,
): Promise<Response> {
  const authorId = input.match(/\d{3,}/)?.[0]
  if (!authorId) {
    return jsonError('invalid_identifier', 'That is not a valid Semantic Scholar author id.', 400, allowOrigin)
  }
  const headers = s2Headers(env)
  let res: Response
  try {
    res = await fetchWithTimeout(
      `https://api.semanticscholar.org/graph/v1/author/${authorId}?fields=name,affiliations,paperCount,citationCount,hIndex,papers.title,papers.year,papers.citationCount,papers.venue,papers.externalIds,papers.tldr`,
      { headers },
    )
  } catch {
    return jsonError('source_error', 'Could not reach Semantic Scholar.', 502, allowOrigin)
  }
  if (res.status === 404) {
    return jsonError('not_found', 'No Semantic Scholar author with that id.', 404, allowOrigin)
  }
  if (res.status === 429) {
    return jsonError('rate_limited', 'Semantic Scholar rate limit reached. Try again shortly.', 429, allowOrigin)
  }
  if (!res.ok) {
    return jsonError('source_error', `Semantic Scholar failed (HTTP ${res.status}).`, 502, allowOrigin)
  }
  const a = (await res.json()) as {
    name?: string
    affiliations?: string[]
    paperCount?: number
    citationCount?: number
    hIndex?: number
    papers?: Array<{
      title?: string
      year?: number
      citationCount?: number
      venue?: string | null
      externalIds?: { DOI?: string | null } | null
      tldr?: { text?: string } | null
    }>
  }
  const lines: string[] = [`Semantic Scholar: ${a.name ?? authorId}`]
  if (a.affiliations?.length) lines.push(`Affiliation: ${a.affiliations.join('; ')}`)
  lines.push(
    `Papers: ${a.paperCount ?? 0}; total citations: ${a.citationCount ?? 0}; h-index: ${a.hIndex ?? 'n/a'}`,
  )
  const papers = (a.papers ?? [])
    .filter((p) => p.title)
    .sort((x, y) => (y.citationCount ?? 0) - (x.citationCount ?? 0))
    .slice(0, 8)
  if (papers.length) {
    lines.push('Most-cited papers:')
    for (const p of papers) {
      const yr = p.year ? `, ${p.year}` : ''
      lines.push(`- "${p.title}"${yr} — cited ${p.citationCount ?? 0}`)
      if (p.tldr?.text) lines.push(`  TL;DR: ${p.tldr.text}`)
    }
  }
  const stats = {
    source: 'semanticscholar',
    title: `${a.name ?? authorId} — Semantic Scholar`,
    entries: [
      { label: 'Papers', value: String(a.paperCount ?? papers.length) },
      { label: 'Citations', value: String(a.citationCount ?? 0) },
      { label: 'h-index', value: String(a.hIndex ?? 0) },
    ],
  }
  const apiPapers: ApiPaper[] = (a.papers ?? [])
    .filter((p) => p.title)
    .slice(0, 100)
    .map((p) => ({
      title: (p.title ?? '').trim(),
      year: p.year ?? null,
      venue: p.venue ?? null,
      citations: p.citationCount ?? null,
      doi: normDoi(p.externalIds?.DOI),
    }))
  return new Response(JSON.stringify({ text: lines.join('\n'), stats, papers: apiPapers }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(allowOrigin) },
  })
}

async function searchSemanticScholar(
  query: string,
  env: Env,
  allowOrigin: string,
): Promise<Response> {
  const headers = s2Headers(env)
  let res: Response
  try {
    res = await fetchWithTimeout(
      `https://api.semanticscholar.org/graph/v1/author/search?query=${encodeURIComponent(query)}&fields=name,affiliations,paperCount,hIndex&limit=5`,
      { headers },
    )
  } catch {
    return jsonError('source_error', 'Could not reach Semantic Scholar.', 502, allowOrigin)
  }
  if (res.status === 429) {
    return jsonError('rate_limited', 'Semantic Scholar rate limit reached. Try again shortly.', 429, allowOrigin)
  }
  if (!res.ok) {
    return jsonError('source_error', `Semantic Scholar search failed (HTTP ${res.status}).`, 502, allowOrigin)
  }
  const data = (await res.json()) as {
    data?: Array<{ authorId?: string; name?: string; affiliations?: string[]; paperCount?: number }>
  }
  const list: Candidate[] = []
  for (const a of data.data ?? []) {
    if (!a.authorId) continue
    list.push({
      id: a.authorId,
      name: a.name ?? a.authorId,
      affiliation:
        a.affiliations?.[0] ?? (a.paperCount != null ? `${a.paperCount} papers` : null),
    })
  }
  return candidates(list, allowOrigin)
}

async function retrieveOpenalex(
  input: string,
  env: Env,
  allowOrigin: string,
): Promise<Response> {
  const id = parseOpenalexId(input)
  if (!id) {
    return jsonError(
      'invalid_identifier',
      'That is not a valid OpenAlex author ID or URL.',
      400,
      allowOrigin,
    )
  }
  const headers = { Accept: 'application/json', 'User-Agent': 'roast-a-researcher' }
  const result = await buildOpenalex(id, env, headers)
  if (!result) {
    return jsonError('not_found', 'No OpenAlex author with that ID, or OpenAlex is unavailable.', 404, allowOrigin)
  }
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(allowOrigin) },
  })
}

// --- search by name (/search) ---

interface Candidate {
  id: string
  name: string
  affiliation: string | null
}

function candidates(list: Candidate[], allowOrigin: string): Response {
  return new Response(JSON.stringify({ candidates: list }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(allowOrigin) },
  })
}

async function handleSearch(
  request: Request,
  env: Env,
  allowOrigin: string,
): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonError('method_not_allowed', 'Use POST.', 405, allowOrigin)
  }
  if (!(request.headers.get('Content-Type') ?? '').includes('application/json')) {
    return jsonError('bad_request', 'Expected application/json.', 400, allowOrigin)
  }
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return jsonError('bad_request', 'Body is not valid JSON.', 400, allowOrigin)
  }
  const body = payload as { source?: unknown; query?: unknown }
  const source = typeof body.source === 'string' ? body.source : ''
  const query = typeof body.query === 'string' ? body.query.trim() : ''
  if (!query) {
    return jsonError('bad_request', 'No search query supplied.', 400, allowOrigin)
  }
  const over = await enforceRetrieveBudget(request, env, allowOrigin)
  if (over) return over
  switch (source) {
    case 'github':
      return searchGithub(query, env, allowOrigin)
    case 'openalex':
      return searchOpenalex(query, env, allowOrigin)
    case 'orcid':
      return searchOrcid(query, allowOrigin)
    case 'semanticscholar':
      return searchSemanticScholar(query, env, allowOrigin)
    case 'dblp':
      return searchDblp(query, allowOrigin)
    default:
      return jsonError('bad_source', 'That source is not available yet.', 400, allowOrigin)
  }
}

async function searchGithub(
  query: string,
  env: Env,
  allowOrigin: string,
): Promise<Response> {
  const headers: Record<string, string> = {
    'User-Agent': 'roast-a-researcher',
    Accept: 'application/vnd.github+json',
  }
  if (env.GITHUB_TOKEN) headers['Authorization'] = `Bearer ${env.GITHUB_TOKEN}`
  let res: Response
  try {
    res = await fetchWithTimeout(
      `https://api.github.com/search/users?q=${encodeURIComponent(query)}&per_page=5`,
      { headers },
    )
  } catch {
    return jsonError('source_error', 'Could not reach GitHub.', 502, allowOrigin)
  }
  // GitHub signals rate limiting as 403 (secondary limits) or 429 (primary).
  if (res.status === 403 || res.status === 429) {
    return jsonError('rate_limited', 'GitHub rate limit reached. Try again later.', 429, allowOrigin)
  }
  if (!res.ok) {
    return jsonError('source_error', 'GitHub returned an error.', 502, allowOrigin)
  }
  const data = (await res.json()) as { items?: Array<{ login?: string }> }
  const list = (data.items ?? [])
    .filter((i) => i.login)
    .map((i) => ({ id: i.login as string, name: i.login as string, affiliation: null }))
  return candidates(list, allowOrigin)
}

async function searchOpenalex(
  query: string,
  env: Env,
  allowOrigin: string,
): Promise<Response> {
  const headers = { Accept: 'application/json', 'User-Agent': 'roast-a-researcher' }
  let res: Response
  try {
    res = await fetchWithTimeout(
      openalexUrl('authors', env, {
        search: query,
        'per-page': '5',
        select: 'id,display_name,last_known_institutions,affiliations',
      }),
      { headers },
    )
  } catch {
    return jsonError('source_error', 'Could not reach OpenAlex (network).', 502, allowOrigin)
  }
  if (!res.ok) {
    return jsonError('source_error', `OpenAlex search failed (HTTP ${res.status}).`, 502, allowOrigin)
  }
  const data = (await res.json()) as {
    results?: Array<{
      id?: string
      display_name?: string
      last_known_institutions?: Array<{ display_name?: string }>
      affiliations?: Array<{ institution?: { display_name?: string } }>
    }>
  }
  const list: Candidate[] = []
  for (const a of data.results ?? []) {
    const id = a.id ? parseOpenalexId(a.id) : null
    if (!id) continue
    list.push({
      id,
      name: a.display_name ?? id,
      affiliation:
        a.last_known_institutions?.[0]?.display_name ??
        a.affiliations?.[0]?.institution?.display_name ??
        null,
    })
  }
  return candidates(list, allowOrigin)
}

async function searchOrcid(query: string, allowOrigin: string): Promise<Response> {
  const headers = { Accept: 'application/json', 'User-Agent': 'roast-a-researcher' }
  let res: Response
  try {
    res = await fetchWithTimeout(
      `https://pub.orcid.org/v3.0/expanded-search/?q=${encodeURIComponent(query)}&rows=5`,
      { headers },
    )
  } catch {
    return jsonError('source_error', 'Could not reach ORCID.', 502, allowOrigin)
  }
  if (!res.ok) {
    return jsonError('source_error', 'ORCID returned an error.', 502, allowOrigin)
  }
  const data = (await res.json()) as {
    'expanded-result'?: Array<{
      'orcid-id'?: string
      'given-names'?: string
      'family-names'?: string
      'institution-name'?: string[]
    }>
  }
  const list: Candidate[] = []
  for (const r of data['expanded-result'] ?? []) {
    const id = r['orcid-id']
    if (!id) continue
    const name = [r['given-names'], r['family-names']].filter(Boolean).join(' ') || id
    list.push({ id, name, affiliation: r['institution-name']?.[0] ?? null })
  }
  return candidates(list, allowOrigin)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const allowOrigin = env.ALLOW_ORIGIN
    const requestOrigin = request.headers.get('Origin') ?? ''
    const path = new URL(request.url).pathname

    // ORCID login redirects (033–035): these are top-level browser navigations
    // (the user is sent to orcid.org and back), so they carry no app Origin and
    // must be handled before the CORS origin-pinning below.
    if (path.endsWith('/auth/orcid/login')) return handleAuthLogin(request, env)
    if (path.endsWith('/auth/orcid/callback')) return handleAuthCallback(request, env)

    // CORS preflight: answered before the POST, only for the permitted origin.
    if (request.method === 'OPTIONS') {
      if (requestOrigin !== allowOrigin) {
        return new Response(null, { status: 403 })
      }
      return new Response(null, { status: 204, headers: corsHeaders(allowOrigin) })
    }

    // Origin pinning: reject anything but the configured Pages origin.
    if (requestOrigin !== allowOrigin) {
      return jsonError('forbidden_origin', 'Origin not allowed.', 403, allowOrigin)
    }

    // Validate the current ORCID-login session (Authorization: Bearer token).
    if (path.endsWith('/auth/me')) {
      return handleAuthMe(request, env, allowOrigin)
    }

    // Structured-source retrieval (ORCID/OpenAlex/GitHub) is served on /retrieve.
    if (path.endsWith('/retrieve')) {
      return handleRetrieve(request, env, allowOrigin)
    }
    // Search a source by name, returning candidate {id, name, affiliation} (017).
    if (path.endsWith('/search')) {
      return handleSearch(request, env, allowOrigin)
    }

    if (request.method !== 'POST') {
      return jsonError('method_not_allowed', 'Use POST.', 405, allowOrigin)
    }

    const contentType = request.headers.get('Content-Type') ?? ''
    if (!contentType.includes('application/json')) {
      return jsonError('bad_request', 'Expected application/json.', 400, allowOrigin)
    }

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return jsonError('bad_request', 'Body is not valid JSON.', 400, allowOrigin)
    }

    const body = payload as {
      profile?: unknown
      intensity?: unknown
      exclude?: unknown
      format?: unknown
      regenerate?: unknown
    }

    // Titles the user marked as mis-attributed (not their work); fed to the system
    // prompt as a trusted exclusion list (never read from the untrusted profile).
    const exclude = Array.isArray(body.exclude)
      ? body.exclude.filter((t): t is string => typeof t === 'string' && t.trim() !== '').slice(0, 100)
      : []

    const profile = typeof body.profile === 'string' ? body.profile.trim() : ''
    if (!profile) {
      return jsonError('bad_request', 'No profile text supplied.', 400, allowOrigin)
    }

    const maxChars = Number(env.MAX_INPUT_CHARS) || 12000
    if (profile.length > maxChars) {
      return jsonError('too_large', `Profile exceeds ${maxChars} characters.`, 413, allowOrigin)
    }

    const rawIntensity = Number(body.intensity)
    const intensity = Number.isFinite(rawIntensity)
      ? Math.min(MAX_INTENSITY, Math.max(MIN_INTENSITY, Math.round(rawIntensity)))
      : DEFAULT_INTENSITY

    // Comedic format (an unknown/absent value resolves to the straight roast) and
    // whether this is a regenerate (the front end sets it on re-roast).
    const format = typeof body.format === 'string' ? body.format : DEFAULT_FORMAT
    const regenerate = body.regenerate === true

    // Model routing from roast.md (per-intensity + regenerate). The client never
    // supplies a model slug, so it cannot steer the Worker onto a costlier model;
    // routing buckets all default to the base model, so this is a no-op until the
    // owner differentiates the models in roast.md.
    const { model } = selectModel(GEN_CONFIG, MODEL_CONFIG.model, { intensity, regenerate })

    // Per-IP daily rate limit. The client IP is taken only from CF-Connecting-IP
    // (Cloudflare sets it at the edge); X-Forwarded-For is never trusted. The IP
    // is hashed with a salt before use, so no raw IP is stored; the counter
    // resets daily via the KV TTL.
    const clientIp = request.headers.get('CF-Connecting-IP') ?? ''
    let rlKey: string | null = null
    let rlUsed = 0
    if (clientIp) {
      const dailyLimit = Number(env.DAILY_LIMIT) || 10
      const key = `rl:${utcDate()}:${await hashIp(clientIp, env.IP_HASH_SALT)}`
      const used = Number((await env.RATE_LIMIT.get(key)) ?? '0')
      if (used >= dailyLimit) {
        return jsonError(
          'rate_limited',
          'Daily roast limit reached. Please try again tomorrow.',
          429,
          allowOrigin,
        )
      }
      // Increment only after the upstream call succeeds (below), so a failed roast
      // does not burn the user's daily quota.
      rlKey = key
      rlUsed = used
    }

    const messages = [
      { role: 'system', content: buildSystemPrompt(intensity, exclude, format, profile) },
      { role: 'user', content: `<<<PROFILE\n${profile}\nPROFILE>>>` },
    ]
    const orBody = (modelSlug: string): string =>
      JSON.stringify({
        model: modelSlug,
        stream: true,
        max_tokens: MAX_OUTPUT_TOKENS,
        // temperature / top_p are optional knobs in roast.md: only sent when set.
        ...(MODEL_CONFIG.temperature != null ? { temperature: MODEL_CONFIG.temperature } : {}),
        ...(MODEL_CONFIG.topP != null ? { top_p: MODEL_CONFIG.topP } : {}),
        // OpenRouter now appends the usage block (token counts + cost in USD) to
        // the final stream chunk automatically; the explicit flag is kept for
        // compatibility with older gateway behaviour and is harmless if ignored.
        // The front-end run metadata reads it from that final chunk.
        usage: { include: true },
        messages,
      })
    const callOpenRouter = (modelSlug: string): Promise<Response> =>
      fetchWithTimeout(
        OPENROUTER_URL,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            // Optional OpenRouter attribution headers identifying this app.
            'HTTP-Referer': env.APP_URL || env.ALLOW_ORIGIN || '',
            'X-Title': 'Roast a Researcher',
          },
          body: orBody(modelSlug),
        },
        15000,
      )

    // Call the selected model; on a failure (timeout or non-OK), fall back once to
    // the configured fallback model before giving up.
    let upstream: Response | null = null
    try {
      upstream = await callOpenRouter(model)
    } catch {
      upstream = null
    }
    if (!upstream || !upstream.ok) {
      const fb = fallbackModel(GEN_CONFIG, MODEL_CONFIG.model)
      if (fb !== model) {
        try {
          upstream = await callOpenRouter(fb)
        } catch {
          upstream = null
        }
      }
    }
    if (!upstream || !upstream.ok) {
      return jsonError('upstream_error', 'The roast could not be generated.', 502, allowOrigin)
    }

    // The roast is being generated: now count it against the daily quota.
    if (rlKey) {
      await env.RATE_LIMIT.put(rlKey, String(rlUsed + 1), {
        expirationTtl: secondsUntilEndOfUtcDay(),
      })
    }

    // Relay the OpenRouter SSE stream straight through, without buffering. Never
    // call .text()/.json() on a streamed response — that would buffer the whole
    // generation and defeat streaming.
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        ...corsHeaders(allowOrigin),
      },
    })
  },
}
