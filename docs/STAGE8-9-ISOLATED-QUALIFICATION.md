# VAOS Stage 8/9 isolated qualification

**Candidate only. Never deploy this fixture Worker or a synthetic PO to production.**

## Stage 8
The production `VAOS_SESSION_HMAC_KEY` secret is present in the Cloudflare binding inventory, but its value must never be retrieved. Hardened authentication stays OFF during qualification.

An isolated CI job generates an independent random 32-byte HMAC key and unrelated maker/checker SHA256 synthetic credential hashes, and exercises the actual login/session code. Test cases: successful role logins, wrong-role denial, legacy-session rejection at cutover, rollback, key rotation, expiry and fail-closed malformed/matched keys.

The isolated Worker fixture is used **only by Wrangler's local runtime** and its synthetic variables; no remote cloud resources or production auth secrets are accessed. Until a real isolated Cloudflare deployment and founder/checker sign-in checks succeed, keep `VAOS_AUTH_HARDENED_CONTROL` OFF in production. The production stored key's quality and actual credential rotation are not remotely attestable from binding metadata.

## Stage 9
In-memory two-frame (one M, one L variant of VYNDI Altitude) synthetic procurement sandbox. The actual existing `PROCUREMENT.CREATE_PO` bridge still refuses all writes. Tests demonstrate maker/checker separation, semantic idempotency, synthetic readback, unknown-outcome HOLD, and zero calls to the actual bridge transport.

**This is NOT a real VYNDI sandbox PO posting.** VYNDI needs an isolated, deliberately provisioned sandbox with canonical request+response contracts, replay evidence, receiving and invoice authority before G5–G7 can pass.

## Release result rules
- All CI jobs PASS is necessary for engineering qualification but insufficient to activate hardened auth or business writes.
- Flag `VAOS_AUTH_HARDENED_CONTROL` remains absent until a planned production cutover. Zero autonomous financial effects authorized.
- No sandbox/qualification runner may request production VYNDI transaction execution or reuse a live account credential.
