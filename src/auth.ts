// ORCID login (session-only). After the OAuth round-trip the Worker mints a
// short-lived, HMAC-signed token and hands it back in the URL fragment. We keep it
// in localStorage and read its (signed, non-secret) payload to drive the verified
// badge. The signature is authoritative only on the Worker (/auth/me); here the
// token drives a cosmetic badge, so reading the payload locally is sufficient.

import { config } from './config'

const TOKEN_KEY = 'orcid_auth_token'

export interface Session {
  orcid: string
  name: string | null
  token: string
}

export function loginUrl(): string {
  return `${config.workerUrl}/auth/orcid/login`
}

export function logout(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* storage unavailable */
  }
}

// Decode the readable JSON payload of a `payload.signature` token. The payload is
// not secret; it cannot be forged without the Worker's signing secret.
function decodePayload(
  token: string,
): { orcid?: string; name?: string | null; exp?: number } | null {
  const dot = token.indexOf('.')
  if (dot < 1) return null
  try {
    const b = token.slice(0, dot).replace(/-/g, '+').replace(/_/g, '/')
    const pad = b.length % 4 === 0 ? '' : '='.repeat(4 - (b.length % 4))
    return JSON.parse(atob(b + pad))
  } catch {
    return null
  }
}

export function getSession(): Session | null {
  let token: string | null = null
  try {
    token = localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
  if (!token) return null
  const payload = decodePayload(token)
  if (!payload?.orcid || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    logout()
    return null
  }
  return { orcid: payload.orcid, name: payload.name ?? null, token }
}

// Read the result the Worker passed back in the URL fragment (#orcid_auth=… or
// #orcid_auth_error=…), store any token, and clean the fragment from the address
// bar. Returns an error code when the login failed.
export function consumeAuthFragment(): { error: string | null } {
  const hash = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash
  if (!hash) return { error: null }
  const params = new URLSearchParams(hash)
  const token = params.get('orcid_auth')
  const error = params.get('orcid_auth_error')
  if (!token && !error) return { error: null }
  if (token) {
    try {
      localStorage.setItem(TOKEN_KEY, token)
    } catch {
      /* storage unavailable */
    }
  }
  // Strip the fragment so the token is not left in the address bar or history.
  history.replaceState(null, '', location.pathname + location.search)
  return { error }
}

// Canonical 19-character ORCID iD (uppercased final checksum), or null.
export function normaliseOrcid(input: string): string | null {
  const m = input.match(/(\d{4}-\d{4}-\d{4}-\d{3}[\dxX])/)
  return m ? m[1].toUpperCase() : null
}
