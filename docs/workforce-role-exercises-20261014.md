# Workforce role exercises — 14 October 2026

## Delivered scope

A first deterministic teaching executor for each of the sixteen employee roles now runs against synthetic records in local isolation. Each role has a predetermined normal case and a seeded defect case. Expected findings are stored separately from the evaluator. These are deliberately small software exercises, not comprehensive professional competence assessments or production departmental executors.

The exercises cover missing ownership/prerequisites, overdue tasks, configuration/allowables gaps, defect/retest gaps, observed blockers versus scored risk, role/session denial, source contradictions, release evidence, commercial approval, material shortages/units, negative stock/lot trace, WIP quality holds, overdue maintenance/return proof, integer-paise ledger balancing/payment approval, attendance/payroll evidence, and BOM revision/effectivity mismatch.

## Execution and persistence

`npm run test:workforce-role-training` runs the regression suite and the 32 role exercises. The command is included in the repository's aggregate `npm test`, so normal CI must exercise it.

`node scripts/qualification/workforce-role-exercises.mjs <local-output.json>` records a per-role result with source/output hashes and runner source hashes. The CLI creates a fresh temporary isolated store, persists outputs, recreates the store for readback/replay, and removes the temporary store on exit. Exported reports remain in the requested file.

The store is single-writer, local and file-backed. An injected interruption occurs after writing a pending file and before committing it by rename. Restart/retry overwrites the pending file and commits the output. A committed duplicate returns the prior output; changed inputs under the same event ID are rejected; modified output without a matching hash is rejected. Unknown callers and unsafe event paths are denied. This is not concurrent/distributed storage, PostgreSQL restore, authenticated session authorization or cryptographic evidence against an attacker able to rewrite the entire envelope.

## Observed results

- All 16 role exercise pairs passed: 32 local deterministic outcomes matched the predefined answer key.
- 33 regression tests passed, including all-role interruption/restart, idempotency, conflict, output corruption, malformed source, production-environment rejection and unauthorized-caller checks.
- Full aggregate `npm test` passed: 1,498 tests across its nine Node test suites, plus web verification, syntax checks and the role-exercise CLI. Diff whitespace checks passed.
- No network, model provider, production store, business action, external message or live qualification flag is used by the exercise runner.

## Qualification boundary

Verdict: LOCAL_DETERMINISTIC_EXERCISES_PASS. Independent employee review was not observed. Neither SOFTWARE_AND_TRAINING_QUALIFIED nor live operational qualification is granted.

Next acceptance requires fuller representative departmental cases, approved role-specific criteria, actual VAOS/VYNDI OS executors in an authenticated isolated environment, event-to-output integration, persistent backend recovery and an independent reviewer who can assess the role outputs. Real project records are not required for those isolated gates. Manufacturing release holds remain separate.

The existing mission-consumer allowlist and production policies are unchanged. Do not import the teaching executor into production as a workaround for incomplete role execution. Its synthetic source checks do not validate real VYNDI record schemas, units, ledger authority or engineering release.
