# VAOS Stage 7 — Multi-topic evidence-grounded conversation (candidate)

**DRAFT / disabled. Do not deploy, set the flag or commission on production before PR review and independent qualification.**

Stage 6 chose ONE topic, which could omit other explicit questions. Stage 7 addresses that limitation with a *multi-topic answer* for each new founder follow-up after the first turn. Its focus is coherent, structured explanations, not unrestricted model prose.

## Functional contract
- Existing Stage 5 immutable thread and Stage 6 bounded prior context remain required. Same founder, mission, and authorized agent: Project Controls or Orchestrator.
- An authoritative Stage 3 mission snapshot supplies ALL displayed facts. The model may only return two fields: \`topics\` (distinct members of status, verification, blockers, evidence, closure) and \`refersTo\` (exact immediately prior request UUID).
- The server independently identifies topics directly and explicitly requested in the newest question. Model selection **cannot remove** those mandatory topics. The server orders and renders the union, always with read-only and no-action language.
- The model returns no mission status, counts, evidence references, closure decision, or business approval. Untrusted user text remains data; model tool calls and extra fields fail closed.
- The Stage 4 single pre-inference claim, immutable reply and authoritative source SHA-256 persist unchanged. Replies have \`AI_DRAFT_UNVERIFIED\` status.
- First turns and standalone Stage 4 requests use the original Stage 4 evidence echo; Stage 6 remains the fallback when Stage 7 is off.

## Controls
- New **OFF** flag: \`VAOS_FOUNDER_MULTITOPIC_CONTROL=verified-v1\`. Requires Stage 6 \`bounded-v1\` and Stage 5 \`ledger-only-v1\`.
- No additional model, paid provider, DB migration or Edge function update.
- Never dispatches tools, closes a mission, changes engineering/production data, or grants decision authority.
- Maximum five topics; 160 model output tokens; output hard-limited to 1200 characters. An oversized report fails closed, not truncated to hide evidence.
- Previous model replies are **not** used as factual ground truth. The existing Stage 4 source hash binds only the current mission snapshot. A context-version/hash ledger will require separate design and governance.

## Release qualification
1. Web route/unit regression including multi-topic, missing model fields, tool calls, cross-agent/mission attempts, replay, Stage 6 fallback and disabled control.
2. Cloudflare Worker dry-run and existing Dify/Windmill CI gates.
3. Independently evaluate live synthetic Workers AI output under exact two-field schema with no tools. If the model cannot comply reliably, do not activate Stage 7.
4. Review and merge PR, confirm Cloudflare deployment and zero migration, check account's free AI allowance.
5. Explicit founder-browser Stage 7 test using a **new** fourth turn with at least verification, blockers, evidence and closure; database readback of model reply and source hash.

This is bounded multi-topic reporting, **not** full open-ended agent reasoning.
