// Public build configuration for the front end. This module is committed and
// shipped to the browser, so it must never contain a secret: the Cloudflare
// Worker holds the API key. See the specification, Data schemas → Configuration.

export interface AppConfig {
  /** Deployed Worker endpoint the front end calls. */
  workerUrl: string
  /** Client-side input cap, mirroring the Worker's authoritative limit. */
  maxInputChars: number
  /** Intensity level used until the user picks one (see intensityLevels). */
  defaultIntensity: number
  /** Show the optional "Log in with ORCID" control (verified badge, session-only). */
  orcidLoginEnabled: boolean
}

export const config: AppConfig = {
  workerUrl: 'https://roast-a-researcher.eelkedevries.workers.dev',
  maxInputChars: 40000,
  defaultIntensity: 3,
  orcidLoginEnabled: false,
}

// The two intensity levels (value sent to the Worker + the pill label). The values
// stay within the 1–3 range the Worker already understands: "Factual" maps to the
// gentlest tier, "Roast" to the strongest.
export const intensityLevels: ReadonlyArray<{ value: number; label: string }> = [
  { value: 1, label: 'Factual' },
  { value: 3, label: 'Roast' },
]

// Comedic format presets the user can pick (the `value` is sent to the Worker as
// `format`; the directives live server-side in worker/roast.md). Keep these keys in
// sync with the `formats` list there. `straight` is the default plain roast.
export const defaultFormat = 'straight'
export const formats: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'straight', label: 'Straight roast' },
  { value: 'reviewer2', label: 'Reviewer 2 report' },
  { value: 'deskReject', label: 'Desk-rejection letter' },
  { value: 'tenureDenial', label: 'Tenure-denial memo' },
  { value: 'grantPanel', label: 'Grant-panel assessment' },
  { value: 'confIntro', label: 'Conference introduction' },
  { value: 'perfReview', label: 'Performance review' },
]

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
    'Choose how hard the roast hits. You can change it and re-roast after seeing ' +
    'the result.',
  roastButton: 'Roast me',
  outputPlaceholder: 'Your roast will appear here.',
  privacyNotice:
    'Your text goes to a language model (via OpenRouter) to generate the roast — ' +
    'nothing is stored. Check',
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
