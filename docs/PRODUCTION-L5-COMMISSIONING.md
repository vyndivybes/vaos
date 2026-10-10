# Production L5 read-only observation — gated commissioning

## Security scope

- Autonomous action: `PRODUCTION.OBSERVE_WIP` only; Q3 minimum, L5 capability, ACTIVE production agent, active Q3 QA verifier roster, autonomous contract declaration and VAOS policy `ALLOW`.
- Target: signed canonical VYNDI `/api/vaos/bridge` through existing service binding.
- One idempotent intent per UTC hour; existing 15-minute cron checks the hour and uses one exact-key scoped lease. No general execution queue draining. Failed/expired leases never auto-retry.
- Existing production/engineering mission remains `HOLD`; no automatic changes to schedules, releases, purchase orders, inventory, geometry, risk acceptance or lifecycle.
- Runtime kill switch: `VAOS_PRODUCTION_OBSERVER_CONTROL=read-only-v1`; absent/anything else means OFF. Do not enable until all gates pass.
- Stop switch prevents further admissions; it cannot roll back an in-flight signed read.

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
