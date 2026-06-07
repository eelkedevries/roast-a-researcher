# Task: ORCID login — front-end control and verified badge

## Goal

Add the "Log in with ORCID" control and the verified badge to the front end.
After login, a roast of the **same** ORCID iD shows a clear "ORCID-verified"
badge. Session-only: the signed token lives in `localStorage`; logout is local.

## Scope

Front end only (`src/`). Uses the Worker endpoints from `034` and the config/copy
from `033`. Merges the originally planned login-UI and badge prompts into one
reviewable front-end unit.

## Required reading

`docs-dev/reference/primary_authoritative/specification.md`: Architecture →
Account verification (ORCID login). The badge is cosmetic and session-scoped; the
token is read locally only to drive the badge (the Worker is authoritative).

## Dependencies

`033_orcid_auth_config`, `034_orcid_oauth_worker`.

## Required changes

1. New `src/auth.ts`: read/clear the token in `localStorage`; `loginUrl()`;
   `consumeAuthFragment()` (store the `#orcid_auth=…` token the Worker returns,
   strip the fragment from the address bar, surface any `orcid_auth_error`);
   `getSession()` (decode the signed token's readable payload, honour `exp`); and
   `normaliseOrcid()` to canonicalise an iD for comparison.
2. `src/ui.ts`: a login control in the header — "Log in with ORCID" when logged
   out (links to `loginUrl()`), or "Verified as <iD> · Log out" when logged in;
   hidden when `config.orcidLoginEnabled` is false. Call `consumeAuthFragment()`
   on mount and render the control.
3. `src/ui.ts` (`fillPersonalia`): when a logged-in session's iD matches an ORCID
   iD among the selected link rows, append the verified badge to the Name row.
4. `src/style.css`: styles for the header control and the badge.

## Do not implement

- any persisted account, server-side session, or cookie;
- changes to the Worker (done in `034`);
- requesting or displaying any private ORCID data.

## Acceptance criteria

- `npm run check` passes.
- Logged out: the control offers ORCID login (when enabled). Logged in: the header
  shows the verified iD and a working logout; a roast of that iD shows the badge.
- With `orcidLoginEnabled` false, no control appears and nothing else changes.

## Automated checks

```bash
npm run check
```

## Manual verification

Live login needs the deployed Worker + registered ORCID app (not testable in the
build container). After deploy, the human logs in via ORCID sandbox and confirms
the badge appears when roasting their own iD.

## Commit and push

If and only if scope was followed and checks pass, commit using this file's exact
filename (`035_orcid_login_badge.md`) as the message, then push.

## Final report

End with the required five-section final report specified in `AGENTS.md`.
