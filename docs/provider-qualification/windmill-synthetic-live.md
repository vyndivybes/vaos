# Windmill VAOS synthetic qualification — commissioning runbook

## Current controls
- **Never** activate production provider routing as part of this test.
- Existing Infisical watchdog, qualification canary, and operating production credentials remain unchanged.
- The preflight in `.github/workflows/windmill-infisical-credential-preflight.yml` must pass first (run 37844255201 passed on 2026-10-08 UTC).
- The synthetic run is **manual, on main only**, and requires typing `RUN_ONE_SYNTHETIC`.
- The test runner may POST **only** `f/vaos/qualification_ping`, then read back that single run.
- The result requires an exact fresh challenge echo and exact marker. Evidence has no secrets or challenge text.
- No automatic retry of the POST; on unknown outcome, investigate Windmill Runs manually.

## One-time Windmill script prerequisite
In Windmill Cloud, open the **VAOS** workspace and create a **TypeScript** script with exact deployed path:

`f/vaos/qualification_ping`

Script source:

```typescript
export async function main(challenge: string) {
  return {
    qualification: "VAOS_WINDMILL_SYNTHETIC_V1",
    challenge,
  };
}
```

Deploy/publish it. This script must not import other scripts, read variables, access external networks, modify data, or acquire elevated permissions.

The existing `f/vaos/engineering_mass_estimate` is **not** an approved qualification target; never run it in this workflow.

## Dedicated token permissions
Windmill's current scope model separates dispatch and job readback. This qualification requires BOTH:

- `jobs:run:scripts:f/vaos/qualification_ping`
- `jobs:read:f/vaos/qualification_ping`

A token with only `jobs:run:scripts` may dispatch successfully and then fail readback with HTTP 403. Since bearer-token permissions cannot be edited after creation in some versions, create a **replacement** limited to the two scopes if required; save the replacement directly to:

Infisical project `vaos-windmill-production`, environment `Production` (`prod`), path `/`, key `WINDMILL_API_TOKEN`.

Never expose values in chat or logs, and retain the previous scoped token until the new one passes validation. Revoke the previously exposed token if that has not already happened.

## Execute
1. Confirm that the safe token is installed and the qualification script is deployed.
2. Open `https://github.com/vyndivybes/vaos/actions/workflows/windmill-synthetic-live-qualification.yml`.
3. Select **Run workflow**, branch **main**, and enter `RUN_ONE_SYNTHETIC`.
4. Confirm both `contract-tests` and `one-synthetic-job` PASS.
5. Inspect `windmill-synthetic-live-evidence` artifact and Windmill **Runs** independently.
6. Verify the recorded job ID and script path match the actual Windmill record. Do not copy a secret to the evidence bundle.

## Failure matrix
- **Authentication failure**: bad/expired Windmill token, wrong workspace, or insufficient run scope. Never reveal the token in logs.
- **Script not found**: deploy the exact qualification path above; do not substitute another existing script.
- **Readback forbidden / job pending**: confirm `jobs:read:f/vaos/qualification_ping` is allowed; investigate the original job ID before retrying.
- **Challenge mismatch**: fail closed, inspect approved script deployment; no production activation.
- **Unknown dispatch outcome**: never blindly retry. Check Windmill Runs for duplicates and resolve the first attempt before any new run.

## Qualification boundary
A passing synthetic run qualifies **one narrowly scoped Windmill API execution and readback**, not ongoing production availability, cancellation, queue/backpressure, unrestricted engineering workflows, or provider activation. Those still require independent assessment and explicit release authority.
