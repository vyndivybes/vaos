# VAOS Stage 5 — durable per-agent mission conversation candidate

STATUS: DRAFT ONLY. Do not apply migration, deploy or set VAOS_FOUNDER_CONVERSATION_CONTROL until independent qualification.

This first slice adds an immutable multi-turn conversation ledger and web UI. A thread is uniquely keyed by the signed founder, qualified pilot agent (Project Controls or Orchestrator only) and exact existing mission ID. The founder can record up to 12 sequential report-request turns, and each can receive one Stage 4 evidence-grounded AI draft. A preceding turn must have a persisted reply before another is linked.

The read-only transcript retains the full founder request, reply, independent evidence IDs and source hash. New instructions are recorded in Stage 2 first, then linked in Stage 5, then Stage 4 is invoked ONCE by explicit user click. If linkage fails, the Stage 2 record may be orphaned but is non-routed. If model inference fails after its one-time claim, do not retry automatically. Refresh history and investigate.

This is not unrestricted natural-language reasoning. The Stage 4 model validates six authoritative mission facts, and VAOS renders the grounded text itself. The conversation carries durable historical context for users, but prior turns are NOT fed into unrestricted model planning. Further work is needed for safe contextual dialogue and robust per-agent domain retrieval. Cross-agent access, business writes, execution, overrides and closure are not supported. Action proposals require a future, separate maker/checker approval lifecycle.

## Safety architecture
- Signed founder session, same-origin POST and exact five-field envelope
- Existing Stage 2 inbox append-only recording, Stage 4 one-time inference claim, Stage 5 append-only thread linkage
- Mandatory prior Stage 2 and Stage 4 flags plus new OFF-by-default VAOS_FOUNDER_CONVERSATION_CONTROL=ledger-only-v1
- New private Supabase RLS tables, server-secret-gated SECURITY DEFINER RPC, mission/agent isolation and 2 turns/minute per thread
- No new paid API key, no new model; reuse the currently commissioned free-tier-gated Workers AI pilot
- Browser uses textContent only; PWA layout mobile-responsive
- No approvals applied and no business writes

## Commissioning
1. PR green: GitHub web + platform tests, Cloudflare dry-run, isolated PostgreSQL migration, RLS, ACL, immutable audit and negative tests.
2. Independent review of source, auth boundaries, ledger ordering and divergence from main.
3. Human-reviewed production additive migration and Edge deployment, then verify readback, anonymous denials and zero staged orphan/turn rows.
4. Enable only VAOS_FOUNDER_CONVERSATION_CONTROL=ledger-only-v1; authenticate founder-browser test, record one synthetic mission follow-up, read back both Stage 5 turn and Stage 4 independent source hash.
5. Recheck Workers AI free quota before expanding; no repeated inference on any request already claimed.
