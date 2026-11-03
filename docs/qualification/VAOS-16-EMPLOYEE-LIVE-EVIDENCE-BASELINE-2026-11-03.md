# VAOS — 16-employee qualification evidence baseline (2026-11-03)

> **Evidence status: READ-ONLY SNAPSHOT. Not an individual qualification certificate, live agent invocation, human review, or authority change.**
>
> Source: connected VAOS Supabase `vaos_private` workforce, assessment, mission, activity and handoff records queried on 3 November 2026. Scoped code baseline `vyndivybes/vaos` main `7460ac4feffd4585f40cab803a43973c863fc991`. Connected Cloudflare metadata confirmed a VAOS Worker version (`8d79ea3a-a4b5-45c9-9005-0acd01639b8b`) receiving 100% deployment traffic; a matching exact source SHA and authenticated browser/agent acceptance were **not** independently established by this source inspection. Controlling issue [#280](https://github.com/vyndivybes/vaos/issues/280).

## Structural read-only results — not runtime qualification

- **16 registered, 16 distinct canonical IDs**, zero missing ID/role/department, zero invalid recorded Q or configured L levels. Identity **structure** check only: PASS.
- 16 `ACTIVE` lifecycle labels; historical `PASS` assessments: 17 records covering 16 identities. Historical labels are not proof of live competence.
- **1 recorded employee heartbeat in the preceding 24h** (production), 15 stale. A heartbeat alone cannot prove an agent ran a job.
- Activity monitor at 2026-11-03 13:20 UTC: **5 BLOCKED, 10 IDLE, 1 PLANNED**. Monitor findings are source records, not live instruction execution evidence.
- 8 historical missions; **9 completed and verified historical handoffs** (latest 2026-10-10); **zero new handoffs during the preceding 7 days**. No fresh cross-agent mission was executed during this assessment.
- The carbon-frame engineering pilot remains **HOLD**. Never convert the project HOLD into a training failure or silently release it.

## Current roster: explicitly separate recorded state from individual commissioning

| Canonical employee ID | Recorded Q | Configured L | Latest monitor | Recent heartbeat (24h) | Historical PASS assessments | Certificate A | Certificate B |
|---|---:|---:|---|---|---:|---|---|
| commercial | 2 | 4 | IDLE | No | 1 | HOLD | HOLD |
| engineering-configuration | 4 | 4 | IDLE | No | 1 | HOLD | HOLD |
| finance | 4 | 4 | IDLE | No | 1 | HOLD | HOLD |
| inventory | 3 | 4 | BLOCKED | No | 1 | HOLD | HOLD |
| knowledge | 2 | 4 | BLOCKED | No | 2 | HOLD | HOLD |
| maintenance | 3 | 4 | IDLE | No | 1 | HOLD | HOLD |
| orchestrator | 2 | 4 | IDLE | No | 1 | HOLD | HOLD |
| people | 3 | 4 | IDLE | No | 1 | HOLD | HOLD |
| procurement | 3 | 4 | BLOCKED | No | 1 | HOLD | HOLD |
| production | 3 | 4 | BLOCKED | **Yes; record only** | 1 | HOLD | HOLD |
| project | 2 | 3 | BLOCKED | No | 1 | HOLD | HOLD |
| qa | 3 | 4 | IDLE | No | 1 | HOLD | HOLD |
| release | 2 | 2 | IDLE | No | 1 | HOLD | HOLD |
| risk | 3 | 4 | IDLE | No | 1 | HOLD | HOLD |
| security | 4 | 2 | IDLE | No | 1 | HOLD | HOLD |
| vibpe | 3 | 4 | PLANNED | No | 1 | HOLD | HOLD |

**Certificate C:** not authorized for any employee by this report. Configured L4 is a policy capability requiring approval, *not* evidence of actual business execution. No employee has configured L5 in this snapshot. No assessment, heartbeat, mission, handoff or permission record was created/edited by this read.

## Wave 1 — existing employees only

### Security `security` — [Issue #448](https://github.com/vyndivybes/vaos/issues/448)

- Registered Q4; configured L2; stale employee heartbeat since 2026-10-08.
- Independent, read-only VYNDI production database role metadata confirmed `hyperdrive-user` has `CREATEDB`, `CREATEROLE`, `BYPASSRLS` and inherited `neon_superuser` privileges. This is **an audit finding observed by the reviewer**, not evidence that the VAOS Security agent detected it.
- **A HOLD:** no authenticated Security agent output, current per-route browser evidence, negative access tests or independent reviewer sign-off.
- **B HOLD:** no authenticated agent-generated least-privilege remediation package, verified handoff or replay/recovery evidence.
- **C NOT AUTHORIZED:** do not modify production roles, policies or credentials.

### Orchestrator `orchestrator` — [Issue #447](https://github.com/vyndivybes/vaos/issues/447)

- Registered Q2; configured L4, last heartbeat 2026-10-06; stale.
- Independent read-only reconciliation: 8 existing missions, 9 verified historical completed handoffs, zero fresh handoffs in 7 days. Existing carbon-frame pilot mission remains HOLD.
- **A HOLD:** no authenticated founder/orchestrator output independently matching source state and denied-access conditions.
- **B HOLD:** no isolated, current, multi-role approved mission with durable handoff/readback, idempotency, replay denial and external reviewer.
- **C NOT AUTHORIZED:** no new production dispatch or granted L5 authority.

## What will make Certificate A independently reviewable?

For each assigned departmental route per `platform/qualification/department-audit.mjs`:

1. Authenticate the actual deployed application with a permitted role; record exact version/SHA, timestamp and authorized session type (no tokens/cookies in evidence).
2. Independently compare displayed values with the authoritative read-side records and report negative/denied requests, empty/stale/error states.
3. Check route, mobile and desktop rendering, role isolation, navigation, provenance and ledger where required.
4. Attach verifiable private browser/source evidence, not just synthetic tests or a software PASS.
5. Separate human reviewer checks the evidence and records explicit scope-level PASS/FAIL/HOLD.

## What will make Certificate B independently reviewable?

Execute **three separate** approved, isolated prepare-only departmental exercises with actual tool invocation, durable work-package handoffs, independent verifier, retry/replay denial and restart/recovery evidence. No production business mutation, synthetic heartbeat backfill or direct qualification SQL updates. Fail closed on source inconsistency.

## Qualification decision

- **Q0 source identity structural check: PASS.**
- **16 individual live Certificate A: HOLD.**
- **16 individual prepare-only Certificate B: HOLD.**
- **16 high-risk Certificate C: NOT AUTHORIZED.**
- **No live VAOS agent autonomy or production effectiveness certified from this snapshot.**
- **Human reviewer: NOT RECORDED.**

This document is a time-bounded audit snapshot. New source/role events require revalidation; it must not be auto-promoted based on GitHub CI alone. Deployment, accessibility, external credentials and human review have independent acceptance gates. Maintain zero-cost/free-tier and cloud-only runtime policy.
