# Stage 3 – founder-agent grounded briefings (candidate)

This change provides an **authenticated, read-only, deterministic report path** for the founder and any selected one of 16 agent roles. It is **NOT model-generated conversation**, asynchronous agent replies, actual agent-to-agent routing or any business execution.

## Contract

\`GET /api/founder-agent-brief?agentId=<id>&missionId=<optional existing mission>\`

- Founder session required. Checker and other identities denied.
- Feature flag \`VAOS_FOUNDER_BRIEF_CONTROL=read-only-v1\` default OFF; no automatic activation.
- Reads VAOS persisted control/workforce snapshot; optionally the exact selected mission.
- Reports employee qualification state and mission-owned work-package counts with persisted independent-review reference counts.
- Does not call LLMs, schedule jobs, write databases, interpret free-text messages, execute intents or approve overrides.
- Never equate persisted independent-review markers with independent evidence-content re-verification. No output is described as a live autonomous agent reply.
- Clear no-store headers and generic failure statuses; show no result if source unavailable.

## Qualification before activating

Run existing npm test workflow, Cloudflare dry-run, authenticated founder/checker/origin tests. Validate database migrations and Edge functions from Stage 2 before claiming durable messages work. Use live test mission with positive and negative review references, confirm source freshness and runtime state are not misrepresented. Explicit founder approval required before enabling the report flag. Independent agent dialogue/actual reasoning remains a separate model-provider-gated milestone.

## Next milestones

Introduce audited message-to-mission triage on explicitly approved read-only jobs, per-role tool/knowledge access with governance and source attribution, independent verifier, then an opt-in conversational model adapter subject to model/provider qualification. Model provider costs, quotas and security must be qualified before deployment.
