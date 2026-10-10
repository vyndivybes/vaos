# VAOS Stage 3: evidence-backed founder report previews

Stage 3 is a non-commissioned draft. It provides one tightly bounded read-only response:
a founder selects a previously persisted REPORT_REQUEST message addressed to the
Project Controls agent or VAOS Orchestrator, and requests a mission status report.

The Worker verifies the signed founder session, same origin, exact POST JSON, 
two OFF-by-default flags, selected agent identity and the exact persisted message.
It retrieves an authoritative VAOS mission snapshot and uses the existing
independent-verifier status model to count verified evidence. It never executes
a model, dispatches a mission, approves a transaction or invokes a business write.
The returned status is READ_ONLY_PREVIEW_NOT_AGENT_REPLY.

To commission: complete Stage 2 Supabase migration and Edge deployment first;
independently test founder and checker sessions, replay, RLS/RPC ACLs, stale
mission snapshots and evidence refs; then run isolated preview browser validation.
Do not set VAOS_FOUNDER_AGENT_REPORT_CONTROL=preview-only-v1 until all gates pass.

Full AI conversation needs a separately qualified model routing/grounding service,
per-agent authorization, cost controls, safe prompt handling, independent evidence
verification and write approval. Voice and push notification are not in scope.
