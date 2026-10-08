# VAOS ↔ VYNDI OS: approved project schedule bridge v1

**Status:** CONTRACT AND OFFLINE EVALUATOR — NOT LIVE DATA QUALIFIED  
**Source repository:** `vyndivybes/vyndios` (Cloudflare / Neon); source model `vyndi_program_tasks` and `vyndi_program_dependencies`.  
**Destination repository:** `vyndivybes/vaos` (Cloudflare / Supabase).  
**Scope:** Project Agent schedule *read-only* analysis and advisory escalation proposals. Human authority for escalation and schedule amendment remains unchanged.

## Evidence and authority contract

VYNDI OS provides `program_id`, task ID, owner, `planned_finish`, `actual_finish`, status, dependency, source reference. Its planning engine `src/lib/program-planning-model.ts` computes dependency-network critical-path and float from duration days; **critical-path modelling is not, by itself, evidence of approval for specific due dates.**

Required *independent* VAOS governance inputs per schedule baseline revision:

- `projectId`, immutable `revision`, `approvedBaselineSha256` computed over the sorted exact approved due dates, owners, IDs and source references.
- `status: APPROVED`, maker (`submittedBy`), different checker (`approvedBy`), `approvedAt` and durable `approvalRef`.
- Trusted provenance `VAOS_TRUSTED_APPROVAL_REGISTRY`. This field must be supplied by the **server-side authority loader**; clients and external exports cannot award themselves approval.
- A schedule provider's current progress snapshot has project ID, observation time, task states, source references and explicit actual completion instants.
- Dates are RFC3339 offset-aware instants. Bare `YYYY-MM-DD` or other date-only values cannot be interpreted without an explicitly approved timezone and end-of-day convention.
- Progress is withheld if it predates the approval, comes from the future, or is older than 24 hours; unknown new task revisions and source-reference conflicts are also withheld.

The pure library `platform/integrations/vyndi-approved-schedule.mjs` exports:

1. `candidateFromVyndiProgramRows(rows,{projectId,revision})` — forms an **UNAPPROVED** baseline candidate from governed VYNDI rows, without promoting it to authority.
2. `fingerprintProposedBaseline(candidate)` — deterministic SHA-256 for a proposed revision.
3. `createAuthorityBoundScheduleEvaluator({loadApprovedManifest})` — server-only trust boundary; ignores any caller-supplied `approval` and uses a VAOS-governed approval loader. No loader/exception ⇒ withheld.
4. `evaluateApprovedProgramSchedule(...)` — computes `BASELINE_DELAY` for incomplete overdue tasks, `LATE_COMPLETION` for completed-after-due tasks, `MISSING_PROGRESS`, `MISSING_ACTUAL_FINISH` and `WAIVER_REQUIRES_REVIEW` as explicit evidence gaps.
5. `prepareScheduleEscalationRecommendation(assessment)` — returns an advisory `PROJECT.ESCALATE_BLOCKER` proposal with `PENDING_HUMAN`; NEVER applies approval, sends messages, changes project state or creates a business write.

The library does **not** trust internal mission `created_at + sla_hours` as a contractual project milestone. Those are kept distinct as `MISSION_CATALOG_SLA_ONLY`.

## Production integration gates still OPEN

1. **VYNDI schedule authority:** locate a real project and confirm its approved frozen baseline revision, owner, proof of approval, immutable source references and actual time-zone semantics. Current VYNDI code shows planned/actual fields and program planning, but does not establish an independently approved immutable revision.
2. **Trusted manifest registry:** implement a server-only, auditable lookup for independently approved baseline manifests; registry must bind project ID + revision + canonical SHA-256 + checker identity + approval evidence. A string saying `APPROVED` on a client payload is insufficient.
3. **Least privilege transport:** a VAOS worker identity reads a source-backed, access-controlled VYNDI OS export over HTTPS, with secret stored only in Cloudflare/approved secret vault; no browser token, no extra paid LLM API, no broad Neon database credentials.
4. **Source reconciliation:** compare VYNDI plan hash and approved authority manifest; bind actual progress to project/task IDs and source references; refuse unapproved re-baselines or 24-hour-stale input. Changes require a new approved revision.
5. **Escalation policy:** render advisory findings with baseline revision, due date, observation, owner and evidence; require a distinct Risk checker and explicit human authority before `PROJECT.ESCALATE_BLOCKER`. No autonomous messaging or critical-status update.
6. **Live qualification:** run a non-destructive positive/negative test on an actually approved program baseline: overdue, on-time, late completed, missing actual, revised plan, duplicate task, future/stale progress, forged approval, missing signature/manifest and rollback. Record source hashes and independent reviewer evidence before calling the capability commissioned.

### Current assessment

Bridge contract and validation are code-testable now. Real production schedule ingestion **cannot be asserted** until an independently approved authoritative VYNDI program revision is present and the trusted server-side source/approval loader is connected and verified.

Do not label this module `production live-qualified` solely because GitHub tests or Cloudflare bundle checks succeed.
