# Production L5 read-only observation — gated commissioning

## Security scope

- Autonomous action: `PRODUCTION.OBSERVE_WIP` only; Q3 minimum, L5 capability, ACTIVE production agent, active Q3 QA verifier roster, autonomous contract declaration and VAOS policy `ALLOW`.
- Target: signed canonical VYNDI `/api/vaos/bridge` through existing service binding.
- One idempotent intent per UTC hour; existing 15-minute cron checks the hour and uses one exact-key scoped lease. No general execution queue draining. Failed/expired leases never auto-retry.
- Existing production/engineering mission remains `HOLD`; no automatic changes to schedules, releases, purchase orders, inventory, geometry, risk acceptance or lifecycle.
- Runtime kill switch: `VAOS_PRODUCTION_OBSERVER_CONTROL=read-only-v1`; absent/anything else means OFF. Do not enable until all gates pass.
- Stop switch prevents further admissions; it cannot roll back an in-flight signed read.

## G9 prelaunch operating scope — 15 October 2026

The existing read-only production observer is the **only** unattended L5 capability controlled by this switch. The three switch states are:

| `VAOS_PRODUCTION_OBSERVER_CONTROL` | What the existing hourly Worker does | Business effects |
| --- | --- | --- |
| Absent, `off`, or any other value | Does not enter the observer | None |
| `shadow-v1` | Reads existing workforce and responsibility-contract readiness only, and returns `SHADOW_READY` if authorized; creates no intent, execution, source observation or approval | None |
| `read-only-v1` | Uses the existing per-hour idempotent intent and exact scoped database claim for the dual-signed VYNDI WIP source read | Read-only evidence and execution audit only |

The live control value is not changed by this release. Rollback from live canary is achieved by restoring an absent/OFF switch: all subsequent observer admissions stop. This cannot undo an in-flight signed read or delete existing evidence, and an isolated simulated sequence is not an actual production stop/start drill.

### Existing live evidence (read-only SQL, 15 October 2026)

- 86 distinct hourly L5 `PRODUCTION.OBSERVE_WIP` intents, one per key, with no duplicate hourly key.
- 81 `SUCCEEDED` hourly jobs with matching signed dual-read source hashes and persisted evidence.
- Five `FAILED` hourly jobs with `VYNDI_BRIDGE_READ_FAILED`, no false completion or source evidence; none was silently retried as a new effect for the same hour.
- One older standalone observation (8 October) was successful but has **no** dual-read source evidence; it is deliberately excluded from the 81 verified hourly records.
- This evidence supports actual narrow supervised read-only L5 operation, not write-role competence or the ability to restore an enterprise platform. Retain the failed observations as recorded events rather than retroactively marking them `PASS`.

Scope-specific software regressions cover reversible shadow → eligible read-only canary → off, permission loss, changed contract, refused writes, unique hour and signed-source receipt. The automated isolated stop demonstrates no **new** admissions after stop; it does not certify a live stop that was not performed.

**G9 prelaunch read-only autonomy can be used under its current switch and existing policy.** Broader operational autonomy remains prepare-only or approval-gated and requires genuine domain executors, action-specific safety evidence and controlled release as the company becomes operational. No global autonomy switch is introduced, no BOM or real historical transactions are required for preparation, and the deferred G8 whole-platform restore is not re-opened.

## Order of commissioning

1. CI: unit tests, SQL scope tests, Edge-function tests, Worker deploy dry-run.
2. Apply additive SQL migration; verify the function signature, least-privilege grants, negative claims for other action types.
3. Deploy `vaos-control` Supabase Edge function with the new scoped claim operation.
4. Deploy Worker code **with the switch absent**, check mission sweep and Infisical watchdog are unchanged.
5. Run authenticated one-shot intent + scoped execution for a single hour, verify receipt and canonical VYNDI readback against a separate read, exact SHA-256 source digest, durable effects/evidence, no mutation.
6. Set `VAOS_PRODUCTION_OBSERVER_CONTROL=read-only-v1` and confirm one completed observation within a full UTC hour and no additional executions in the same hour.
7. Stop switch and verify no new intents or leases; test a rejected Q-level/contract and unauthorized action.
8. Report PASS only if all gates, including actual unattended cadence, are independently observed.

**Do not enable on production by merely merging this package.** Live authenticated qualifications and migration validation remain mandatory.
