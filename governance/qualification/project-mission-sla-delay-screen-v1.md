# PROJECT.DETECT_DELAY — mission SLA age screening v1

**Qualification state:** CANDIDATE — code and SQL checked; live mission execution NOT YET QUALIFIED.  
**Owner:** Project Agent (Q2). **Independent verifier:** Risk Agent (Q3).  
**Authority:** `ANALYSE` / catalogue authority 1; no external effects.

## Scope and evidence model

Reads only the authoritative VAOS mission snapshot, specifically
`vaos_private.work_packages.created_at`, `sla_hours`, `status`,
`depends_on`, and identifiers. The catalogue SLA is an **internal mission
service-level duration**, not an approved project milestone, formal schedule
baseline, committed completion date or contractual deadline.

Open work packages other than the Project monitoring package are evaluated
at a captured UTC observation instant:

- `SLA_OVERDUE:<work-package-id>:<derived-UTC-deadline>` only if
  `observedAt > created_at + sla_hours`.
- `SLA_SOURCE_MISSING:<work-package-id>` if a usable timestamp,
  positive finite SLA duration, or valid chronology is absent.
- Completed and cancelled work packages are excluded from current SLA age findings.
- The report stores the precise observation timestamp, the scope
  `MISSION_CATALOG_SLA_ONLY`, and deterministic findings.
- An independent Risk Agent verifier recomputes against fresh authoritative
  mission data and refuses tampered, future-dated or >10-minute-old reports.

**A finding is not an automatic escalation.** The existing
`PROJECT.ESCALATE_BLOCKER` action is high-risk and human-approval-required;
it remains outside the scheduled read-only consumer. No automatic risk
acceptance, schedule re-baselining, priority changes, notices or stakeholder
communications are authorized.

## Governance and release requirements

- Read-only job `PROJECT.DETECT_DELAY` is explicitly allowlisted in the
  mission consumer and all three protected database functions: evidence
  recorder, runnable mission discovery, and closure-readiness verifier.
- Immutable evidence report is stored with database-generated SHA-256.
- Every work package requires independent maker/checker evidence for
  closure readiness; no direct public/anonymous/authenticated RPC access.
- Existing 15-minute Cloudflare scheduler is the execution mechanism once
  merged and deployed; no new runtime secret or scheduler interval required.

## Formal project-delay detection remains OPEN

The current VAOS private `work_packages` schema has `created_at` and
`sla_hours`, **but no authoritative approved due-date/milestone baseline**.
A production-grade project scheduling capability requires:
1. Versioned authoritative schedule records with WBS/work package mapping,
   approved due dates, source URI/ID, owner, timezone and revision.
2. Source authentication, freshness and synchronization reconciliation with
   VYNDI OS project controls (or another approved source).
3. Clear differentiators for baseline delay, SLA duration, blocker, and
   forecast, with actual completion timestamps and confidence/evidence.
4. Independent Risk review, stakeholder escalation proposal, separate human
   approval before dispatch, audit events, rollback, and negative-case tests.
5. Real-world data qualification in a controlled production mission before
   labelling the capability fully commissioned.

**Do not interpret an absence of SLA findings as proof that an actual project
is on schedule.** Real scheduling evidence is not yet available in VAOS.

## Regression test matrix

- Overdue project work package with source `created_at` and `sla_hours`.
- Open on-time package: no false positive.
- Completed package: excluded.
- Missing timestamps/SLA: explicit evidence gap, never inferred.
- Tampered evidence, altered SLA, future observation and stale (>10 min)
  observation: rejected by independent verifier.
- Human-approved/effectful job: not consumed.
- Database server-key guards and closure evidence checks remain active.
