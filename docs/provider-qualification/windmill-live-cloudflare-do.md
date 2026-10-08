# VAOS Windmill Cloudflare live Durable Object qualification

This is an isolated infrastructure test, not a Windmill business execution.

## Authentication

A GitHub Actions **push to main** in the exact workflow
`.github/workflows/windmill-live-do-qualification.yml` obtains a short-lived
OIDC token with audience `vaos-windmill-do-qualification`.
Cloudflare checks Google's? **No**: it directly verifies GitHub's RSA signing
key against the official GitHub JWKS endpoint, requiring:
- issuer `https://token.actions.githubusercontent.com`;
- signature RS256 and matching GitHub signing key;
- exact repository `vyndivybes/vaos`, `ref=refs/heads/main`, `event_name=push`;
- exact trusted workflow_ref path on main;
- custom audience, bounded token lifetime, and numeric run ID and attempt.

The qualification API accepts only authenticated POSTs with exact phase
`start` or `finish`. GET returns 405 with no mutation to enable deployment
readiness polling. Failed authentication returns 401.

## Isolation and state

The API always derives a *separate* Durable Object name:
`vaos-windmill-selftest-<verified GitHub run ID>-<verified attempt>`.

The real production object `vaos-windmill-global-v1` is never accessed.
The self-test does not read Windmill tokens, call Windmill APIs, issue real
cancellation requests, or enable `WINDMILL_ADMISSION_ENABLED`.

Phase 1 (start):
1. Submit two simultaneous reservation requests for different synthetic IDs
   to the same live Durable Object.
2. Require exactly one GRANTED and one BLOCKED: max concurrency 1, queue 0.
3. Durably transition the granted slot to DISPATCHING.
4. Save run fence/deadline metadata and register an expiry alarm.
5. Verify audit sequence is 2.

Phase 2 (finish), in a **separate HTTPS request**:
1. Read the persisted run ID, fence and slot.
2. Verify real wall-clock expiry, triggering fail-closed quarantine if needed.
3. Require active state QUARANTINED and audit count 3.
4. Prove a competing reservation is BLOCKED and no implicit release occurs.
5. Emit sanitized PASS evidence with `windmillCalls=0`.

This checks Cloudflare's real Durable Object binding, transactional storage
across separate HTTP requests, concurrency, expiration and durable audit.

## Evidence and limitations

Workflow: https://github.com/vyndivybes/vaos/actions/workflows/windmill-live-do-qualification.yml

After the merge, the push-to-main workflow runs automatically. It polls for
the deployed route (HTTP 405) for up to six minutes, authenticates using
GitHub OIDC and performs the two phases. It does not retry uncertain POSTs.

Artifact: `windmill-cloudflare-do-live-evidence`.

A successful result does **not** prove forced process eviction/restart,
automatic alarm delivery scheduling, nor actual Windmill API cancellation.
Nor does it prove production routing is safe to enable.

## Remaining release gates

1. Observe a real Durable Object alarm callback and prove recovery after
   process eviction/deployment, without clearing an uncertain slot.
2. Stage a benign, bounded, explicitly approved Windmill cancellation job
   with separately scoped cancel permission and read-only verification.
3. Independently reconcile real provider terminal state with VAOS audit.
4. Record durable sign-off and keep the provider manifest disabled until
   all required gates pass.

This workflow uses GitHub-hosted runners and the existing Cloudflare Worker.
No development services need to run on the local computer.
