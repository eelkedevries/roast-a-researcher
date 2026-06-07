# Task: ORCID login — Worker OAuth flow

## Goal

Implement the server-side ORCID OAuth authorization-code flow in the Worker so a
researcher can prove ownership of their ORCID iD. Mint a short-lived signed
session token (no database) the front end can later present.

## Scope

Worker endpoints and signing helpers only. The front-end control and badge are
`035`. Config/secrets/spec are `033`.

## Required reading

`docs-dev/reference/primary_authoritative/specification.md`: Architecture →
Account verification (ORCID login), Data flow and statelessness. The flow uses the
minimal `/authenticate` scope (returns only the iD), holds no private data, and
persists nothing.

## Dependencies

`033_orcid_auth_config` (Env vars/secrets, config, spec).

## Required changes

1. Signing helpers in `worker/src/index.ts`: base64url encode/decode and an
   HMAC-SHA256 sign/verify over a compact `payload.signature` token, using
   `SESSION_SECRET`. Verification must reject a bad signature or an expired `exp`.
2. `GET /auth/orcid/login`: build a signed, time-limited `state`, then 302-redirect
   to `${ORCID_OAUTH_BASE}/oauth/authorize` with `client_id`, `response_type=code`,
   `scope=/authenticate`, `redirect_uri`, and the `state`.
3. `GET /auth/orcid/callback`: verify `state` (signature + freshness); exchange the
   `code` at `${ORCID_OAUTH_BASE}/oauth/token` (form-encoded, with the client
   secret) for the response containing `orcid` and `name`; mint a session token
   `{orcid, name, exp}`; 302-redirect the browser to `${APP_URL}#orcid_auth=<token>`
   (or `#orcid_auth_error=<reason>` on failure).
4. `GET /auth/me`: read `Authorization: Bearer <token>`, validate it, and return
   `{orcid, name}` (200) or `{error}` (401).
5. Routing: handle `/auth/orcid/login` and `/auth/orcid/callback` **before** the
   CORS origin-pinning block (they are top-level browser navigations from
   `orcid.org`, so they carry no app `Origin`). Handle `/auth/me` after origin
   pinning. Extend `corsHeaders` to allow the `Authorization` header and the `GET`
   method. When `ORCID_CLIENT_ID`/`ORCID_CLIENT_SECRET`/`SESSION_SECRET` are unset,
   treat login as disabled (clear error / no crash).

## Do not implement

- any front-end control, redirect handling, or badge (that is `035`);
- any cookie, database, or persisted account;
- requesting any scope beyond `/authenticate`, or reading the ORCID record here.

## Acceptance criteria

- `npm run check` passes and `wrangler deploy --dry-run` succeeds.
- The token is signed with `SESSION_SECRET`; tampered/expired tokens fail `/auth/me`.
- With login secrets unset, the endpoints return a clear "disabled" error and the
  rest of the Worker is unaffected.

## Automated checks

```bash
npm run check
cd worker && npx wrangler deploy --dry-run
```

## Manual verification

Live OAuth requires the registered ORCID app and deployed secrets, and cannot run
in the build container (network allowlist blocks `orcid.org`). After deploy, the
human verifies the round-trip against ORCID sandbox.

## Commit and push

If and only if scope was followed and checks pass, commit using this file's exact
filename (`034_orcid_oauth_worker.md`) as the message, then push.

## Final report

End with the required five-section final report specified in `AGENTS.md`.
