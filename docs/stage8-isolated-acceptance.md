# Stage 8 isolated acceptance and revocation repair

The synthetic, isolated CI acceptance suite uses randomly generated identities' credentials and a random HMAC key. No production credentials or business writes are used.

## Revocation patch (candidate, not commissioned)
Under the `dedicated-hmac-v1` hardened-control flag, the logout handler hashes the signed token with SHA-256 and stores the fingerprint in the existing private `VAOS_ARTIFACTS` R2 bucket at `security/stage8/revoked/`. It requires write-then-readback to acknowledge logout. The Worker checks the same R2 record **before routing any /api request**. Revoked sessions are rejected with HTTP 401, and absent/inaccessible storage produces HTTP 503. The original bearer token is not stored.

No auth flag is enabled by this change. The existing development flow stays unchanged until hardened-auth cutover is separately authorized.

## Qualification boundaries
- Synthetic tests validate maker/checker credentials and session separation, cookie attributes, tampering/expiry, and durable R2 revocation readback using an in-memory fake bucket.
- GitHub CI smoke checks are not a live R2 multi-instance acceptance test.
- R2 revocation integrity, actual Worker binding, and cross-instance persistence must be qualified in an isolated environment before hardened auth is activated.
- Stage 8 cannot be certified until a separate live maker/checker flow, independent audit readback, a trusted certificate signer, and all eight evidence checks are complete.
- Do not manufacture evidence or enable production writes in order to force `authenticatedSignInQualified=true`.
