# Infisical commissioning readiness — safe-hold stage

This workflow audits already-qualified Infisical `secret.broker` without changing production configuration, database state, or provider routing.

## Checks

- Read persisted Infisical provider state through the dedicated existing scoped GitHub credential.
- Confirm provider remains **qualified and disabled**, before qualification expiry.
- Verify all 15 Wave-2 records, including the explicit owner **qualification-only** approval reference.
- Report whether persisted health is fresh; health is not sufficient to authorize activation.
- Always report `activationAuthorized=false` and `canActivate=false`.
- Produce a nonsecret audit artifact. `SAFE_HOLD` is the correct result until activation prerequisites are separately completed.

## Guardrails

The script only invokes `providerStateGet` and `qualificationEvidenceList`. It never calls state writes or Infisical APIs and never exposes credentials. The workflow uses `VAOS_DB_RPC_SECRET` only for its existing scoped read permissions.

Do not broaden the evidence key. Commissioning and activation require a **separately provisioned, narrowly scoped write identity**, a fresh live Infisical canary health probe with recorded evidence, a rollback/kill-switch check and **distinct explicit owner activation approval**.

Running this audit is *not* approval to activate Infisical or any other provider.
