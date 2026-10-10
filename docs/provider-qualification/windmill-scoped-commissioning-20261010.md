# Windmill Cloud — scoped commissioning, 10 October 2026

## Owner decision and limits

The VAOS owner explicitly approved **commissioning** on 10 October 2026, limited to preapproved low-risk read-only `code.execute` scripts, maximum **one** concurrent job, distinct least-privilege credentials, no blind retries, no business writes, and a kill switch.

The independently sourced seven-gate assessment (GitHub Actions 37913984566; cancellation 37913831673; forced restart 37906973346) returned `READY_FOR_HUMAN_APPROVAL`. This establishes prerequisite evidence, **not** production execution eligibility or a fresh health result. The new safe runtime supports only `f/vaos/qualification_ping`. Do not mistake this for general-purpose employee execution.

## Safe Cloudflare config

Cloudflare Worker `vaos`: set these **only after** least-privilege tokens exist and are independently checked:

| Binding | Required value or type |
|---|---|
| `WINDMILL_BASE_URL` | literal `https://app.windmill.dev` |
| `WINDMILL_WORKSPACE` | literal `vaos` |
| `VAOS_WINDMILL_EXECUTE_OWNERS` | approved maker identity only, `shyamsundhar1982@gmail.com` |
| `WINDMILL_DISPATCH_TOKEN` | encrypted Worker secret; grant only approved qualification script execution |
| `WINDMILL_VERIFY_TOKEN` | **different** encrypted Worker secret; read-only job status for same workspace |
| `WINDMILL_ADMISSION_ENABLED` | `true` only when the durable singleton slot is verified healthy |
| `WINDMILL_SCOPED_ENABLED` | `owner-approved-20261010` only after all live checks |
| `WINDMILL_KILL_SWITCH` | start with `true`; switch to `false` only for an accepted, bounded live run |

Do not share credentials, secret IDs, token prefixes or token bytes in GitHub, logs or chats. Do not grant access to other scripts or production ERP mutation.

## Durable state and independent acceptance

- The **authoritative** persisted Windmill provider state must be present, `enabled:true`, `code.execute:true`, qualified for that capability, with unexpired qualification and health readback not older than five minutes. Nothing auto-promotes it from the original `evaluation` manifest.
- The `WINDMILL_ADMISSION` Durable Object must return an empty singleton slot with `maxConcurrentRuns:1`, `queuedRuns:0` and the known v1 schema.
- `POST /api/windmill-scoped-run` is callable only with a signed owner session, exact production origin, `application/json`, the header `x-vaos-csrf-intent: windmill-scoped-ping-v1`, and the sole body `{"operation":"RUN_ONE_QUALIFICATION_PING"}`. It does **not** accept a script path, arguments or additional operations.
- One Windmill POST dispatches `f/vaos/qualification_ping`, followed by GET of the exact provider job using a distinct readback credential. Proof must match the script path, returned job ID, and private challenge. DO fencing is released only after successful verified terminal readback.
- Dispatch timeouts or unverified output retain a reserved/quarantined slot. **No automatic retry**. Reconcile the provider job independently before any next execution.
- No business writes and no dynamic code execution are implemented through this endpoint.
- Review `node --test platform/execution/windmill-scoped-runtime.test.mjs apps/web/api/windmill-scoped-run.test.mjs` and run full `npm run test:platform`, `npm run test:web` and Worker bundle tests before promotion.

## Current commissioning status

At implementation inspection, the production Worker had a Windmill Durable Object binding but lacked all `WINDMILL_*` secret/flag bindings above; the production Supabase `provider_control_state` had **no Windmill row**. Production must therefore remain **HOLD**, despite successful qualification evidence, owner approval and passing CI.

Cloudflare preview deploys can fail with error 10067 because the Free account has exhausted its 100 Durable Object namespaces. That infrastructure failure must not be treated as a passed preview; do not delete unknown namespaces with persistent state. Main-branch deployment may succeed independently.

**Owner scope authorizes only this controlled process, not bypass of any independent production gate.**
