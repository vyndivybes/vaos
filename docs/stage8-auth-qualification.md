# Stage 8 — evidence-gated development authentication qualification

This change introduces a fail-closed **verification gate**. It does not itself perform live sign-in acceptance, issue signatures, store audit records or authorize a production cutover.

## Independent qualification prerequisites

In an isolated development environment, an independent maker/checker qualification process must exercise and retain durable audit readback for:
- maker and checker sign-in
- session isolation and cross-environment rejection
- invalid signature rejection and expired session rejection
- logout/invalidated-session rejection
- audit readback independent of the test issuer

Only an authorized, external qualification process may produce the signed evidence envelope. Do **not** populate the envelope by hand merely to make the status green.

## Evidence binding

The server-side reader expects:
- `VAOS_STAGE8_EVIDENCE_SIGNING_KEY`: separate 32-byte hex secret, never committed
- `VAOS_STAGE8_QUALIFICATION_REVISION`: immutable tested deployment revision
- `VAOS_STAGE8_QUALIFICATION_EVIDENCE`: externally produced JSON envelope `{record,signature}`

The 32-byte HMAC key must be limited to the trusted qualification signer and read-only verifier. The record has `version:1`, `environment:"development"`, `revision`, millisecond `issuedAt` and `expiresAt` (maximum one hour), `checks` (eight required true controls), distinct founder `maker` and `checker`. The signature uses HMAC-SHA256 over the canonical field order in `stage8-qualification-evidence.mjs`.

**Security:** A signed statement is only as trustworthy as its signer. Protect signer authority separately; require the signer to validate independent evidence before issuance. Never issue a certificate based solely on a checklist submitted by the same actor. An expired certificate is not an authorization for production.

When preflight fails or evidence is absent/invalid/stale/wrong-revision, `authenticatedSignInQualified` remains false. `productionCutoverAuthorized` and `actionAuthorized` are always false.

## Acceptance

Run the existing `npm run test:web` workflow and `node --test apps/web/api/auth-cutover-readiness.test.mjs` in CI. Verify the deployed revision and independent evidence readback in the development environment. Until the separate signer, durable audit store, and live tests are commissioned, Stage 8 stays **PENDING**, and Stage 9 business writes remain disabled.
