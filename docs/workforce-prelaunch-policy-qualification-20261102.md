# VAOS 16-Employee Prelaunch Policy Qualification
## Scope and evidence — 2026-11-02
The Node test suite `npm run test:workforce-prelaunch` exercises all 16 declared employees in isolated dry-run: one declared task, denied evidence deletion, denied task in TRAINING status, and denied task in RESTRICTED status. Test evidence is **synthetic** and never authorizes a real production action.
A reproduced defect in `KNOWLEDGE.READ_GRAPH` returned UNKNOWN_ACTION instead of the existing agent's declared read/prepare capability. The minimum policy permits ANALYSE-authorized, low-risk reads under `commissioningMode: live_read`. Authority below the execution threshold still prepares only, and capability checks, source access and human approvals are unchanged.
No live source verification, model training, app credential, human approval, operational effect, or employee launch certificate is asserted from this suite.

## Qualification still required
For each employee: prove a source-backed role task using a signed-in normal workflow, check stale/missing/conflicting data fail closed, verify replay/recovery and no duplicate effects, independent role-specific reviewer approval, durable evidence references, and time-bound operational observation. An active label or a synthetic passing test is not proof of live authority.
The Finance, Engineering Configuration and Production employees must remain guarded by the existing ledger, BOM and job-card provenance holds. CA certification and release decisions remain human-only.
