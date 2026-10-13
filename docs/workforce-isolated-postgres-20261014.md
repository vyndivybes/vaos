# Workforce isolated PostgreSQL recovery — 14 October 2026

Baseline: VAOS main dc717fa (includes PRs 313–319). Existing role exercises are reused; no production fixture records or qualification flags are installed.

## Implemented and observed

`npm run test:workforce-training-postgres` runs an isolated PGlite 0.5.9 database using the already pinned dependency. All sixteen role owners contribute normal and seeded-defect outputs, checked against the existing answer key, for 32 stored rows.

The test verifies SQL roles and row-level policies, refuses untrusted reads and reader/writer deletions, rejects duplicate event identities and production-labelled or incomplete outputs, and rejects UPDATE/DELETE even by the test database owner using an append-only trigger. A failed transaction rolls back its inserted row.

It writes a PGlite datadir archive to a temporary local file, hashes its bytes before/after filesystem readback, closes the original database, loads the archive into a fresh PGlite instance, compares every source/output row, and reruns access/immutability checks. Both instances and temporary files are cleaned up. This is a synthetic PostgreSQL-engine data restore, not JSON metadata replay.

The full aggregate npm test passed: 1,515 tests across ten suites, plus web verification, syntax checks and the role CLI. The check is included in aggregate npm test. No network/database credentials, production imports, hosted app endpoints, qualification transitions or model calls are required.

## Limitations

This is local PGlite-to-PGlite restore using dumpDataDir/loadDataDir. It is not pg_dump against VAOS Supabase, independent external recovery review, encrypted production backup, hosted authenticated acceptance, distributed concurrency acceptance or all-role professional competence. SQL test roles are not real authenticated founder/employee accounts. The production G2b gate and SOFTWARE_AND_TRAINING_QUALIFIED remain HOLD.

Official API reference: https://pglite.dev/docs/api#dumpdatadir. Datadir archives are designed for importing back into PGlite; do not describe them as general PostgreSQL-version-compatible backups.

## Hosted isolation blocker

On 14 October the connected Supabase account listed only production project jjzycduoujbmiegqfiud and no development branches. The attempted cost lookup returned UNAVAILABLE because get_cost was absent from the service tool list. No billable branch/project was created or cost confirmation fabricated. The inspected preview configuration uses vaos-preview.invalid. An authenticated isolated hosted training target is not yet established.

To continue: restore access to cost/branch provisioning or identify an already-authorized isolated hosted target; verify cost and boundaries before provisioning; run actual VAOS/VYNDI role executors with synthetic data, save/read back their outputs and obtain independent role review. Missing real project data is expected and does not prevent this isolated work. Manufacturing release holds remain separate.
