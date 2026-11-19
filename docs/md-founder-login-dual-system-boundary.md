# VAOS founder MD session binding — commissioning status

**Approval:** Managing Director of Vāyú Shastr Pvt Ltd approved reuse of the existing founder login as the administrator identity for VAOS and VYNDI OS.

## Current implementation (no false SSO claim)
The new founder-only `GET /api/founder-md-identity` route verifies the existing hardened VAOS HMAC-v2 cookie, including expected founder principal, signed session version, unique session ID format, issue/expiry bounds and a production dedicated-HMAC control. It does not consume a visitor-supplied `userId` or `email` parameter.

Upon verification, the handler uses the existing P-256 signed, nonce-claimed VYNDI service binding to read **aggregate, no-secrets** Better Auth identity evidence through `GOVERNANCE.OBSERVE_MD_IDENTITY`. It independently checks the expected action, source authority, read-only flags and non-authoritative identity status. Raw account identifiers, emails, credentials, VYNDI sessions and unexpected fields are never returned. Unavailable or forged evidence results in an explicit HOLD.

An **existing active VAOS session** authenticates the founder **only in VAOS**. It cannot mint a VYNDI session or grant an admin role there. An existing VYNDI account and role are checked, not created or elevated. Production reads before commissioning found a matching VYNDI admin account with **unverified email**, so the binding remains HOLD.

`status=HOLD`, `vaosFounderSessionVerified=true` (only after a real cookie), `crossPlatformSsoVerified=false`, `mdAuthenticatedAcrossBoth=false`, `productionWriteAuthorized=false`.

## Remaining acceptance
- Confirm actual founder-session endpoint readback in production; anonymous and wrong-user negative controls.
- Verify the existing VYNDI Better Auth email using the already configured provider.
- Implement a proper cross-origin OAuth/OIDC SSO authorization-code exchange with PKCE/state/nonce before claiming one interactive login works for both.
- Independently qualify least-privilege runtime DB role, enforced company scope and approved maker/checker controls before business writes.

No new paid infrastructure, credential sharing, password handling, session migration or database mutation was introduced.
