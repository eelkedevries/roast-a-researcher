# Task: ORCID login — configuration and spec (no live calls)

## Goal

Lay the configuration groundwork for an optional "Log in with ORCID" feature that
marks the logged-in researcher's profile as **verified** (session-only, no
database). This prompt adds config, secrets documentation, and the binding spec
section. It adds no runtime behaviour.

## Scope

Configuration, types, and specification only. The Worker OAuth flow is `034`; the
front-end login control and verified badge are `035`. Do not add endpoints or UI
here.

## Required reading

`docs-dev/reference/primary_authoritative/specification.md`: Architecture (Data
flow and statelessness), Data schemas (Configuration). The session-only,
no-database decision and the token-via-`Authorization`-header design (the Pages
front end and the Worker are different sites, so a session cookie would be a
blocked third-party cookie).

## Dependencies

The deployed Worker (`003`) and the existing ORCID retrieval (`009`).

## Required changes

1. `worker/wrangler.toml` `[vars]` (non-secret, committed): add `ORCID_OAUTH_BASE`
   (default the **sandbox** `https://sandbox.orcid.org`), `ORCID_CLIENT_ID`
   (public by OAuth design), `ORCID_REDIRECT_URI` (the Worker's
   `/auth/orcid/callback`), and `APP_URL` (the Pages app URL to return the browser
   to after login).
2. `worker/src/index.ts` `Env`: add the four vars above plus the two new secrets
   `ORCID_CLIENT_SECRET` and `SESSION_SECRET` (both optional in the type, so the
   Worker still builds without them; `034` treats their absence as "login
   disabled").
3. `src/config.ts`: add `orcidLoginEnabled: boolean` (default `true`) and the
   user-facing copy strings for the login control and the verified badge
   (`loginButton`, `loggedInLabel`, `logoutButton`, `verifiedBadge`,
   `verifiedTitle`). British English.
4. Specification: add an "Account verification (ORCID login)" subsection under
   Architecture, documenting the session-only OAuth `/authenticate` flow, the
   signed-token-in-`Authorization`-header session (no cookie, no database, only
   the verified iD is held — in a short-lived signed token), and that the badge is
   a cosmetic, session-scoped indicator. Add the new vars/secrets to the
   Configuration tables. Bump the spec version and date.

## Do not implement

- the Worker `/auth/*` endpoints (that is `034`);
- any front-end control, redirect handling, or badge rendering (that is `035`);
- any database, cookie, or persistent account.

## Acceptance criteria

- `npm run check` passes and `wrangler deploy --dry-run` succeeds.
- The new config and secrets are documented in the spec, and the version is bumped.
- No runtime behaviour changes.

## Automated checks

```bash
npm run check
cd worker && npx wrangler deploy --dry-run
```

## Manual verification

Confirm the new `[vars]` read sensibly and that the spec section describes the
session-only, header-token design.

## Commit and push

If and only if scope was followed and checks pass, commit using this file's exact
filename (`033_orcid_auth_config.md`) as the message, then push.

## Final report

End with the required five-section final report specified in `AGENTS.md`.
