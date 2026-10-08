# Risk Agent — mission blocker identification v1

**Classification:** CANDIDATE / CODE-QUALIFIED, **NOT** production end-to-end qualified  
**Job:** `RISK.IDENTIFY`  
**Owner:** original VAOS `risk` agent (minimum Q3)  
**Execution:** read-only `ANALYSE`, authority 1; independent verifier `orchestrator` per maker/checker fallback.

## Evidence sources

Only the authoritative snapshot of the **same VAOS mission**:
- Work-package IDs, states, and explicit `depends_on` relationships.
- A `BLOCKED` or `FAILED` package *other than the Risk job itself* is reported as `MISSION_BLOCKER:<id>:<status>`.
- A missing upstream work-package ID is reported as `MISSING_DEPENDENCY:<child>:<dependency>`.

No inference about enterprise risk probability, severity, impact, mitigation,
acceptance, account security, materials, structural engineering or financial
exposure is performed. Findings are *indicators requiring review*, not adopted
risk-register records or quantified assessments. Zero findings is not proof
that no enterprise risk exists.

## Safety gates

- Mission consumer explicit allowlist, correct owner/authority/mode.
- Existing Q3 agent activation and responsibility-contract enforcement.
- No human-approved or effectful work auto-consumed.
- Persisted immutable report and server-side SHA-256.
- Independent verifier recomputes findings from the current mission snapshot.
- Private service-key RPC restricts evidence submission and runnable discovery.
- Database closure-readiness gate requires the same immutable evidence and
  `VERIFY` event for this action, just like the prior three read-only actions.
- No direct `anon` / `authenticated` role execution of evidence RPC.

## Qualification result

- Unit cases: blocked, failed and missing upstream items; deterministic findings;
  tampered findings rejected; human-approval bypass refused.
- SQL migration: evidence-write allowlist, runnable mission discovery and
  closure-readiness gate updated atomically in one versioned migration.
- CI: required `web-smoke` and `cloudflare-smoke` must pass on the exact PR head.
- Live Cloudflare deployment and full production `RISK.IDENTIFY` mission:
  **not established by this record**.

## Next mandatory gate

After the qualifying commit deploys in Cloudflare, execute a labelled
read-only mission fixture; verify Risk Agent ACCEPT → evidence record →
SUBMIT → independent Orchestrator VERIFY → completion. Exercise a second
negative mission with a deliberate missing or blocked dependency using a
transaction-safe or clearly labelled fixture. Do not mark Risk Agent's
enterprise risk management job family qualified on the strength of this
mission-only screening action.

The qualified three-stage historical production mission
`VAOS-QUAL-READONLY-20261008-01` is unaffected and remains
`READY_FOR_CLOSURE` awaiting human administrative authority.
