# Stage 8 — Production signing-key readiness (candidate)

**Read-only inspection; no authentication cutover, production writes or session invalidation.**

Once merged, a signed-in founder may visit GET \`/api/auth-cutover-readiness\`. The endpoint:
- Requires current signed founder session, denies checker and unauthenticated callers, and is GET-only with \`Cache-Control: no-store\`.
- Evaluates whether the **actual Worker process.env** used by session signing can see the encrypted HMAC binding and distinct maker/checker digests.
- Rejects missing/short/malformed key, known legacy maker digest, missing or shared checker digest, HMAC copied from password hash and runtime vs Worker binding mismatch.
- Returns only READY/HOLD and enum-like failure codes. **Never** returns a secret, digest, token or signature, and never enables \`VAOS_AUTH_HARDENED_CONTROL\`.
- Does not prove the key was generated with a cryptographically secure RNG, does not verify actual founder/checker plaintext credentials, and does not provision MFA or session revocation. A READY state is **not** production activation authorization.

## Release and rollback gates
1. Web/Cloudflare regression and isolated Stage 8 auth qualification green.
2. Independent founder-authenticated production GET preflight shows READY; no secret exposed.
3. Actual current founder and checker login verified in an isolated production-like environment without replaying real sessions or exposing passwords.
4. Rollback of the hardening flag independently tested, accounting for existing-session acceptance after rollback and cookie invalidation at cutover.
5. Only a separate explicit production cutover permits setting \`VAOS_AUTH_HARDENED_CONTROL=dedicated-hmac-v1\`.

Stage 9 remains synthetic-only: there is no commissioned PO write execution. Do not enable VYNDI write routes.
