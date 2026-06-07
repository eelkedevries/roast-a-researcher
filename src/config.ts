// Public build configuration for the front end. This module is committed and
// shipped to the browser, so it must never contain a secret: the Cloudflare
// Worker holds the API key. See the specification, Data schemas → Configuration.

export type Intensity = 'mild' | 'medium' | 'spicy'

export interface AppConfig {
  /** Deployed Worker endpoint the front end calls. Wired in 003; empty for now. */
  workerUrl: string
  /** Model slug requested by default (confirmed against openrouter.ai/models at build). */
  defaultModel: string
  /** Client-side input cap, mirroring the Worker's authoritative limit. */
  maxInputChars: number
  /** Intensity used when the user does not choose one. */
  defaultIntensity: Intensity
  /** Show the optional "Log in with ORCID" control (verified badge, session-only). */
  orcidLoginEnabled: boolean
}

export const config: AppConfig = {
  workerUrl: 'https://roast-a-researcher.eelkedevries.workers.dev',
  defaultModel: 'google/gemini-2.5-flash',
  maxInputChars: 40000,
  defaultIntensity: 'spicy',
  orcidLoginEnabled: true,
}

export const intensityLevels: readonly Intensity[] = ['mild', 'medium', 'spicy']

// User-facing copy. British English throughout. Kept here so wording is adjusted
// in one place. The error strings are fixed, in-character messages used from the
// streaming/error work onwards; they are never produced by a second model call.
export const copy = {
  title: 'Roast a Researcher',
  tagline: 'Paste your own academic profile and have it roasted.',
  framing:
    'This is self-directed comedy: run it on your own record. The roast is ' +
    'comedy about a public academic profile, not a verdict on a person.',
  inputLabel: 'Your profile text',
  inputPlaceholder: 'Paste your bio, publications, grants, or CV text here…',
  intensityLabel: 'Intensity',
  intensityHint:
    'Defaults to spicy. Dial it down before roasting if you would prefer a ' +
    'gentler touch.',
  roastButton: 'Roast me',
  outputPlaceholder: 'Your roast will appear here.',
  privacyNotice:
    'Your text is sent to a language-model provider (via OpenRouter) to ' +
    'generate the roast. Nothing is stored; the roast is produced per request. ' +
    'Read the provider’s data policy before pasting anything sensitive.',
  providerPolicyUrl: 'https://openrouter.ai/privacy',
  providerPolicyLabel: 'OpenRouter’s data policy',
  // ORCID login (035). Session-only verification: logging in confirms your ORCID
  // iD, and a roast of that same iD then shows a verified badge. Nothing is stored.
  loginButton: 'Log in with ORCID',
  loggedInLabel: 'Verified as',
  logoutButton: 'Log out',
  verifiedBadge: 'ORCID-verified',
  verifiedTitle: 'This profile’s ORCID iD matches the logged-in researcher.',
  errorStrings: [
    'The model has stepped out for a sabbatical. Try again shortly.',
    'Peer review came back: revise and resubmit (in other words, try again).',
    'Desk-rejected by the server. Give it another go in a moment.',
  ],
}
