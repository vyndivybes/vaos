# Expanded local workforce training — 14 October 2026

Baseline: merged PR #321, main 574c43c. Paid branching and hosted integration are outside this local continuation.

## Corrected observed defects

Two new regression tests failed against the prior evaluator. Whitespace-only owner, prerequisite, source, unit, lot and attendance references could incorrectly produce no finding. Training source checks also accepted negative receipts/issues and unsafe integer monetary amounts. The evaluator now treats whitespace references as missing, rejects negative stock movements and arithmetic overflow, and requires safe integer paise values.

These are changes to deterministic synthetic training only. No VYNDI production stock or financial formula, schema or runtime policy changed.

## Expanded exercises and outcomes

The separate answer-key fixtures now define four cases per employee, 64 cases across sixteen roles. Additional cases isolate individual findings and exercise exact deadlines, completed overdue tasks, zero/equal stock balances, surplus versus shortage, reviewed defects, zero monetary balances and individual approval/source failures.

The file-backed exercise runner covers all 64 expected outputs and replay/readback. The loopback HTTP suite reuses hardened fixture login, submits all 64 cases, verifies duplicate replay and conflicting inputs, persists SQL results, restores a fresh PGlite database, signs in again and compares every authenticated output row. Existing source, access and production-route denial checks remain active.

Saved evidence: governance/workforce-training/expanded-role-exercises-20261014.json. It identifies source hashes, expected/observed findings, per-role rows and local readback. It does not grant qualification or claim independent reviewer observation.

Full local npm test passed: 1,518 tests across eleven suites, web verification, syntax checks and the 64-case runner. Diff whitespace checks passed.

## Acceptance scope

LOCAL_EXPANDED_DETERMINISTIC_EXERCISES: PASS.
LOCAL_AUTHENTICATED_SQL_RESTORE_READBACK: PASS.
Broad departmental competence, all 107 job executors, actual LLM behavior, hosted automation, browser/device acceptance and production G2b recovery remain unverified. These software teaching exercises do not train model weights or establish that employees can perform arbitrary professional work. Founder Shyam remains the approval authority; no additional person is imposed as a blocker.
