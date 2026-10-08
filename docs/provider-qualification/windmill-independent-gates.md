# Windmill independent verification and operating-safety gates

## Evidence already established

- Windmill synthetic qualification run [37847337453](https://github.com/vyndivybes/vaos/actions/runs/37847337453) completed successfully.
- Source artifact: `windmill-synthetic-live-evidence`.
- The deployed, approved script is `f/vaos/qualification_ping`.
- Current provider manifest remains disabled and evaluation-only.

## Independent read-only verification

A **different** Windmill token is required for independent verification. Do not reuse
the dispatcher token from Infisical `vaos-windmill-production`.

1. Open Windmill **User Settings → Tokens**.
2. Create a token named `vaos-independent-readonly-v1`, expiring within 90 days.
3. Enable **Limit token permissions** and choose only
   `jobs:read:f/vaos/qualification_ping`.
4. Do **not** select job run, job cancel, script write, workspace admin or token management.
5. Save the new token securely as a GitHub Actions repository **secret** named
   `WINDMILL_VERIFIER_READ_TOKEN` in `vyndivybes/vaos`.
6. Do not paste the value into chat, code, CI variables or workflow inputs.

The independent verifier has no access to the Infisical dispatch machine identity.
It accepts the prior immutable GitHub Actions artifact, checks repository, exact source
run ID, source commit, executed script path, successful completion and output marker,
then calls only Windmill `GET /api/w/vaos/jobs_u/get/{jobId}`.
It writes sanitized PASS/FAIL evidence without copying tokens, job output or challenges.

Manual workflow:
`https://github.com/vyndivybes/vaos/actions/workflows/windmill-independent-operational-qualification.yml`

Select branch **main**, enter `37847337453` for `source_run_id`, and run once.
Expected both jobs PASS, with artifact `windmill-independent-verification-evidence`.
If readback is forbidden, inspect Windmill token permissions and do not reuse the
execution token as a workaround. Do not automatically retry ambiguous operations.

## Operational gates — implemented contracts, not yet live qualified

The repository defines these fail-closed **qualification admission conditions**:
- Explicitly approved script path `f/vaos/qualification_ping` only.
- Production provider routing disabled, kill switch not engaged, and explicit approval.
- Durable lease store required (not yet wired); no optimistic local-memory lease substitution.
- At most one in-flight job; queued jobs must be zero (no waitlist).
- Runtime budget up to 60 seconds.
- Queue snapshot not older than 30 seconds.
- Cancellation proof requires a real canceled job ID and independent state readback.

These predicates are security contracts, not evidence that production queue
measurement, durable lease implementation, or live cancellation have passed.
**No production activation is authorized by these tests.**

## Pending production-release evidence

- Provide a production-backed durable admission lease with atomic reservation, expiry,
  crash recovery, and concurrent-run rejection. Prove it using concurrent real requests.
- Verify actual queue depth/backpressure and quota/compute limits on the Windmill workspace.
- Stage a purpose-built *harmless, bounded-duration* cancellation drill with separately
  authorized cancellation rights and a read-only verifier. Never cancel business jobs.
- Prove restart/recovery, outcome-unknown non-redispatch, expiry, health and rate limits.
- Confirm independent audit ingestion into VAOS production, then review operator sign-off.
- Only after these live evidence gates are green should a separate production activation
  proposal be prepared. Keep `integrations/windmill/provider-manifest.json` disabled.

## Security

The previous chat screenshot exposed a Windmill token. Verify that it was revoked.
Do not revoke `vaos-production-broker` or any unrelated credential in this work.
Windmill docs: https://www.windmill.dev/docs/core_concepts/user_tokens and
https://www.windmill.dev/docs/core_concepts/jobs
