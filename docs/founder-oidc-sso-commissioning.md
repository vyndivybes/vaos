# Founder single sign-on commissioning

Vāyú Shastr Pvt Ltd: Founder/Managing Director approval granted. Budget: zero cost.

**Current decision: HOLD.** The existing VYNDI Better Auth user has verified email and an assigned admin role. VAOS maintains an independent signed HMAC-v2 browser login. Matching email is NOT federation.

## Implemented in this PR

- VAOS relying-party login start at GET /api/founder-sso-start. Uses randomized state, nonce, PKCE S256 and AES-256-GCM-encrypted, host-only Secure HttpOnly transaction cookie (five minutes).
- VAOS return at GET /api/founder-sso-callback. Rejects injected callback parameters, unexpected authorization response issuer, wrong state and missing/expired transient cookie.
- After a code exchange, independently validates the issuer JWKS signature, JWT algorithm, issuer, audience, expiration, nonce, stable founder-subject SHA-256, and the issuer UserInfo subject, founder email and email_verified=true.
- Only a valid founder identity may obtain a newly issued hardened VAOS session, after the current browser VAOS session revocation is checked.
- Existing password login remains unchanged. Neither endpoint authorizes business writes or upgrades VYNDI roles.

## Production activation remains OFF

The following must be independently configured on both VAOS runtime and Cloudflare binding:

- VAOS_VYNDI_OIDC_ENABLED = commissioned-v1
- VAOS_VYNDI_OIDC_CLIENT_ID = exactly registered client ID
- VAOS_VYNDI_OIDC_CLIENT_SECRET = confidential client secret in Cloudflare Secrets
- VAOS_VYNDI_FOUNDER_SUB_SHA256 = SHA-256 of independently verified stable Better Auth founder subject
- VAOS_SESSION_HMAC_KEY = existing dedicated HMAC key, together with VAOS_AUTH_HARDENED_CONTROL = dedicated-hmac-v1

Without these settings, the login start is disabled and cannot mint a session.

## Outstanding mandatory issuer work

Better Auth 1.7.26 provides official OAuth2.1 / OIDC provider functionality through @better-auth/oauth-provider, NOT through the existing genericOAuth client or the removed legacy oidcProvider plugin. To enable it safely:

1. Add the pinned matching provider dependency and audited lockfile. Apply its documented database migration only after isolated migration and rollback testing. Do not mutate production schema blindly.
2. Create supported sign-in/consent screens, verify issuer discovery and JWKS from the real production VYNDI origin, require PKCE S256 and explicit administrator-controlled client registration.
3. Register VAOS as one confidential client with exactly https://vaos.vayushastr.workers.dev/api/founder-sso-callback as redirect URI. Store client secret in Cloudflare encrypted secrets, not GitHub.
4. Qualify genuine founder identity subject (not email equality), sign-in, consent, token exchange, invalid code/replay, wrong account, revoked session, signed cookies, login cancellation and logout through a real browser.
5. Re-run the complete regression suites and exact production Cloudflare commit checks. Until then, do not enable the SSO control switch.

Official documentation: https://better-auth.com/docs/plugins/oauth-provider

Status: Implemented and testable VAOS client behind release gate. VYNDI identity-provider commissioning, live user browser acceptance, and joint SSO remain HOLD. No paid service or Work mode token needed.
