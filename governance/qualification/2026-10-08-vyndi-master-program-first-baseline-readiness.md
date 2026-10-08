# VYNDI-MASTER-PROGRAM — first real schedule qualification gate

**Decision:** Designate `VYNDI-MASTER-PROGRAM` as the *first* project for the VAOS ↔ VYNDI OS formally approved schedule pipeline.  
**State:** `DESIGNATED / NO SCHEDULE RECORDS / NO APPROVAL` — **not** `APPROVED`, `LIVE_QUALIFIED`, or `DELAYED`.  
**Assessment date:** 8 October 2026, VYNDI Neon production source and VAOS Supabase production destination.

## Evidence taken from authoritative production sources

VYNDI OS Neon project `damp-mountain-07086274`, default `production` branch `br-weathered-base-aef23yeq`, database `neondb`.

| Production source | Verified observation |
| --- | --- |
| `vyndi_programs` row | `VYNDI-MASTER-PROGRAM` exists, status `active`, revision 1, last updated 2026-10-04T09:27:43.697Z |
| `vyndi_program_tasks` | **0 rows** for program; no owners, planned finishes, actual finishes, or sources |
| `vyndi_program_dependencies` | **0 rows** for program |
| `vyndi_program_plan_authority` | **0 rows** at inspection |
| All `vyndi_program_tasks` | **0 rows across all programs** |
| `planned_start`, `planned_finish`, `actual_start`, `actual_finish` database types | PostgreSQL `date` (date-only, with no offset or approved end-of-day convention) |

VAOS Supabase project `jjzycduoujbmiegqfiud`:

| Governance source | Verified observation |
| --- | --- |
| `vaos_private.approved_program_baselines` | **0 rows** |
| `vaos_private.approved_program_baseline_revocations` | **0 rows** |
| `public.vaos_get_approved_program_baseline` | executable by `service_role` only, denied to `anon` and `authenticated` |
| `vaos-control` Edge | deployed as v21 with server-key-gated schedule-approval lookup |

**Meaning:** The selected program is present but there is no evidence-backed baseline to hash, approve, compare or monitor. An empty task plan cannot be considered on-time or late. Do not write fictitious tasks, dates, completion values, approvals, or baseline hashes.

## Required actual plan intake in VYNDI OS

Use VYNDI OS's **Integrated Operating Plan** / its governed Program Planning task entry controls. A designated project owner must submit real, traceable values before any approval attempt:

| Required data | Rule |
| --- | --- |
| Program ID | Fixed `VYNDI-MASTER-PROGRAM` |
| Work breakdown | Each real task/milestone has a unique ID and meaningful description |
| Task owner | Accountable department/person, not an invented placeholder |
| Baseline dates | Planned start and finish with their actual business meaning and source |
| Dependencies | Real predecessor/successor IDs and justified lag, not inferred relationships |
| Progress | Real status, actual finish where known, and evidence refs |
| Source reference | Durable, traceable planning evidence and revision history |
| Schedule convention | **Explicitly approved** business timezone and interpretation of date-only planned finish (e.g., agreed cutoff time, not an automatic midnight assumption) |
| Baseline revision | Immutable identifier for exactly the version submitted for approval |

**Critical source/contract mismatch:** VYNDI currently stores planned/actual dates as `date`; the VAOS `vyndi.program.baseline.v1` contract requires offset-aware timestamps. No conversion to an instant is permitted without an approved timezone/cutoff convention. A data change to `date` must not silently change the approved schedule revision.

## Independent maker/checker baseline approval

1. Real source-task rows entered and validated in VYNDI.
2. Maker freezes candidate baseline: exact project ID, task IDs, owners, source refs, planned finish *instants* after approved timezone/cutoff conversion, revision and canonical SHA-256.
3. Checker must be a different accountable principal; reviews source rows, evidence and baseline hash, approves with explicit timestamp and durable evidence reference. **No self-approval.**
4. An authorized governance transaction, not a browser claim, registers the checker-approved record in `vaos_private.approved_program_baselines`. That table is immutable; corrections require a new independently approved revision, and revocation is append-only.
5. VAOS's server-side approval loader retrieves the manifest; signed source export is reconciled to the same task identities and approved SHA-256. Missing data, changed plan, unsigned transport, future/stale progress, unknown tasks or unapproved revisions return `WITHHELD`.

## Release/qualification criteria (all mandatory)

- [ ] Source contains real program tasks, owners, deadlines, dependencies and evidence.
- [ ] Source identifies responsible maker and reviewer, who are independent.
- [ ] Business timezone and finish-day cutoff are approved and versioned.
- [ ] Frozen exact baseline with canonical SHA-256 and source-revision evidence exists.
- [ ] Independent governance approval is recorded and read from the protected VAOS registry.
- [ ] Cloudflare `vaos` access-controlled schedule reader is deployed; `VAOS_SCHEDULE_READERS` explicitly configured for authorized principals; `VYNDI` binding is working.
- [ ] Signed source read produces current authoritative task data without privileged browser tokens.
- [ ] End-to-end positive: actual approved baseline and fresh progress yield correctly evidenced status.
- [ ] End-to-end negatives: absent approval, self approval, timezone ambiguity, stale source, tampered/changed task dates, unauthorized user and revoked approval are all fail-closed.
- [ ] Independent Risk verifier reviews any delay assessment; `PROJECT.ESCALATE_BLOCKER` remains advisory and requires human approval before an external effect.
- [ ] Audit and deploy SHA captured; no business status or schedule mutation as a side effect of read-only qualification.

## Operational handoff

**Current release decision: NO-GO for live project milestone delay monitoring.**  
Reason: zero authoritative task records, missing approved timezone cutoff, and zero approved baseline manifests.

**Next authorized human input:** supply the real task plan into VYNDI OS and identify its independent approving authority. This document **does not approve** that plan or register a baseline. Nothing in this document modifies either production database.
