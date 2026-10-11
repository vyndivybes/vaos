# Stage 8 isolated acceptance — qualification record

This CI job uses fresh random synthetic credentials and a temporary HMAC key in a Node process. It does not connect to Cloudflare authentication, accept production passwords, configure Worker secrets, or authorize a production cutover.

Coverage: distinct maker/checker identity, credentials and sessions, cookie attributes, wrong-password denials, token tampering, expiry, and signing-key isolation.

**Known critical hold — logout revocation:** `logout.mjs` clears only the browser cookie. A copied, still-unexpired token remains valid on the server. This is intentionally asserted in the regression test. Do not sign `logout_rejected: true` on the basis of cookie clearing. A server-side session revocation store or carefully justified alternative is required before a full Stage 8 pass.

Additional holds: no separately credentialed live maker/checker acceptance, no deployed revision readback, no independent durable audit receipt, and no trusted issuer provisioned. Thus none of the generated synthetic CI results may be fed to `VAOS_STAGE8_QUALIFICATION_EVIDENCE`. The existing signed-evidence verifier remains fail closed.

Next commissioning milestone: implement durable revocation and demonstrate it in tests; commission separate-role live tests and independent audit readback; only then issue revision-bound, short-lived signed evidence through a controlled signer. Production cutover and business writes remain disabled.
