# VAOS Windmill durable-admission / Cloudflare qualification

## Design and release boundary

The Windmill execution provider remains disabled in
`integrations/windmill/provider-manifest.json` and no production scheduler
dispatches Windmill business jobs. This implementation provides the
**qualifying infrastructure**, not a production authorization.

The coordinator is one SQLite-backed Cloudflare Durable Object keyed to
`vaos-windmill-global-v1`, bound as `WINDMILL_ADMISSION`. It is exported by
`apps/web/cloudflare-entry.mjs` and uses Cloudflare's transactional storage.
The per-object singleton ensures atomic admission of at most **one** approved
`f/vaos/qualification_ping` job, with **zero queued** jobs.

The Worker only exposes a read-only endpoint
`GET /api/windmill-runtime-status`:
- Requires a signed VAOS session **and** explicit comma-separated
  `VAOS_WINDMILL_STATUS_READERS` allowlist.
- No other HTTP method accepted.
- No credentials, raw job outputs, secrets or event payloads returned.
- Missing binding fails closed with HTTP 503.
- All mutation RPC methods remain internal to the Worker, and require
  `WINDMILL_ADMISSION_ENABLED=true`, which is **NOT set** by Wrangler.

## Durable state progression

```
RESERVED -> DISPATCHING -> RUNNING -> [SUCCEEDED or FAILED readback] -> RELEASED
                            |
                            +-> CANCEL_PENDING -> verified canceled -> RELEASED
                            |
                            +-> QUARANTINED (lease expired / uncertain)
                                        |
                                        +-> verified terminal readback -> RELEASED
```

An already-reserved job returns `ALREADY_RESERVED` and MUST NOT be dispatched
again. Another job returns `BLOCKED`. A reservation or dispatch with an
unmatched fence/epoch is refused. Alarm-based lease expiry quarantines the
slot permanently until a known Windmill job is independently checked as
terminal. **Never auto-release or redispatch on timeout.**

Every state transition appends a monotonically sequenced durable event to the
coordinator's attached SQLite-backed storage. Audit metadata contains no
access tokens, payloads, arbitrary text from jobs or raw output.

## Execution and cancellation boundaries

`createWindmillExecutionSupervisor` coordinates one approved synthetic
dispatch and readback through a caller-provided authenticated transport.
Dispatch begins **after** its intent is durably written and is never
automatically retried. Errors after the dispatch attempt retain the occupied
slot for reconciliation.

`createWindmillCancellationController` uses the official endpoint
`POST /api/w/vaos/jobs_u/queue/cancel/{jobId}` with a distinct
operator-authorized cancellation token, **without force cancel**, and
**does not retry the POST** after ambiguous errors. It uses a separate
read-only token for `GET /api/w/vaos/jobs_u/get/{jobId}`. A successful cancel
POST is not terminal proof; only matching `canceled:true`, `success:false`,
job ID and script path permit closure.

This implementation does NOT currently include a live, dedicated long-running
cancellation drill, production queue telemetry, Windmill workspace quotas, or
production-backed evidence ingestion. Those are further release gates.

## CI qualification

Workflow:
`https://github.com/vyndivybes/vaos/actions/workflows/windmill-durable-cloudflare-qualification.yml`

On pull requests it runs:
1. Concurrent admission, replay, restart, timeout/quarantine, cancellation
   and audit tests (transactional fake used for contract qualification).
2. Auth-protected, read-only Cloudflare API contract tests.
3. Wrangler dry-run bundle including the SQLite Durable Object.
4. Provider-disabled-by-default assertion.

Live Cloudflare test is a **manual** main-branch workflow dispatch with
`verify_remote=true`. It makes only an anonymous GET to the deployed
`/api/windmill-runtime-status` and must receive HTTP 401 and `no-store`.
It does not log in, expose secrets, dispatch jobs or change database state.

## Deployment procedure

1. Confirm all GitHub workflows green and review the Wrangler new SQLite
   namespace/exports lifecycle change. Changing Durable Object class
   lifecycle may constrain rollback to earlier Worker versions.
2. Deploy exclusively through the existing approved Cloudflare path. No new
   paid service, local Ubuntu or runner is needed.
3. Confirm the Windmill provider still reads `enabled:false`.
4. Set `VAOS_WINDMILL_STATUS_READERS` only when a trusted read operator is
   approved; do not enable `WINDMILL_ADMISSION_ENABLED` without an explicit
   qualified change and independent authorization.
5. Run the manual read-only Cloudflare remote smoke. A 401 confirms the route
   is deployed and authentication required; it does **not** prove the DO
   is operational or that any job has executed.
6. Have an approved operator retrieve a signed-in, authorized status snapshot
   and confirm `bindingReady:true`, `routingEnabled:false`, and no active job.
7. Before any live dispatch, run a **separate** real Cloudflare DO
   concurrency/restart/alarm qualification, independently verify recovery,
   and collect an actual cancellation-drill artifact.

The existing 15-minute VAOS cron and Infisical watchdog are unchanged.
