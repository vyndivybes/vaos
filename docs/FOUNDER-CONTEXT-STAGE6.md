# Stage 6 — bounded contextual follow-up (review candidate)

**STATUS: DRAFT. OFF by default. Do not deploy/activate without independent review.**

## What changes
- Stage 5 persists one immutable thread per founder/agent/mission, with up to 12 turns.
- With a NEW OFF-by-default Worker secret \`VAOS_FOUNDER_CONTEXT_CONTROL=bounded-v1\`,
  Stage 4's already commissioned /api/founder-chat path uses the prior *two* stored
  founder questions to resolve the focus of a **new** Stage 5 turn.
- It never feeds a previous model reply into the prompt as authority. A prior
  turn must already have a persisted, source-hashed Stage 4 reply.
- An eight-field strict JSON response must echo exactly the six authoritative
  mission facts, plus one \`focus\` from {status,verification,blockers,evidence,closure}
  and \`refersTo\` matching the preceding request UUID.
- The model's free-form text is NOT displayed. The Worker constructs an
  evidence-only explanation with current authoritative facts, the chosen
  focus and the preceding immutable request identifier.
- A new Stage 5 conversation can use this when it has at least one prior
  completed request. First turns and standalone Stage 4 report requests
  continue to use the existing six-field evidence echo.
- Existing persistent Stage 4 rows are NOT re-inferred or mutated.
- A single pre-inference database claim remains mandatory; **no blind retry**.

## Scope limits
The capability is *bounded contextual interpretation*, not open-ended expert
reasoning. The AI chooses a constrained focus from recent questions but cannot
provide unsupported facts, autonomous decisions or write access. It is limited
to Project Controls and Orchestrator; Stage 5's mission and agent isolation,
founder authentication, independent evidence, claims, RLS and immutable audit
remain in force.

The Stage 4 source hash covers the current authoritative mission report.
Prior requests are separately immutable in Stage 5's ledger but do not yet
have a combined dialogue-context digest in the reply table. For a future
regulatory-grade full conversation transcript, introduce a versioned,
cryptographically linked context digest in a separately qualified migration.

No new paid model, database migration, or hosting service is required.

## Qualification before commissioning
- Full web/platform tests, Cloudflare dry-run and Stage 5 PostgreSQL regression
- Negative cross-agent/mission, stale prior reply, JSON injection, invented
  evidence, model tool attempts, Replay/no double inference tests
- Review of billed inference allowance and strict fail-closed behavior
- Human authorization to merge/deploy, then one authenticated *new* follow-up,
  source-hash persistence and readback. No agent or business writes.
