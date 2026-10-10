# VAOS LangGraph agent supervision

LangGraph is embedded in the existing VAOS Cloudflare Worker. It monitors agents and orchestrates a bounded read-only mission handoff using the existing governance service. It does not require a LangSmith account, a hosted LangGraph server, a local server, a model API key or a paid subscription. Infrastructure remains the existing Worker and Supabase deployment.

## Operator surface

Open **Agent supervision** in the control workspace (`/agent-supervision.html`). The fleet monitor shows persisted lifecycle, qualification, recorded heartbeat and pending approvals. Enter a mission ID to inspect its handoffs, blocked work packages and control eligibility. Runtime liveness is explicitly unverified: registry entries and historical heartbeats do not establish live processes.

Authenticated API:

- `GET /api/langgraph` monitors persisted workforce and approval state.
- `GET /api/langgraph?missionId=<assigned-id>` adds mission coordination state.
- Same-origin `POST /api/langgraph` with `{"operation":"RUN_SAFE","missionId":"<assigned-id>"}` coordinates at most one eligible read-only handoff.

The real `@langchain/langgraph` StateGraph follows monitor → admission → consume → independent-role review → persisted evidence readback. It accepts no client actor, approval, authority, arbitrary tool, code or node selection. The allowlist is the existing `SAFE_MISSION_JOBS`. Both owner and verifier must be ACTIVE at their catalog qualification floor. Effectful jobs and lifecycle decisions remain in the existing VAOS approval workflows.

`OBSERVED` means a persisted snapshot was read. `PASS` means only the selected handoff completed with separate-role verification, a matching reviewed evidence reference and a fresh source-backed evidence readback. It does not qualify the whole workforce or close the mission. Missing sources, altered admission, rejection or uncertain writes result in `HOLD`.

## Commissioning and stop control

Control is disabled by default; monitoring does not require the control flag. After preview/live authentication, mission evidence and role separation checks pass, the operator can commission bounded read-only control with Worker variable `VAOS_LANGGRAPH_CONTROL=read-only-v1`. Removing or changing the value stops new admissions and is checked before each subsequent control phase. A phase already in flight may finish; this flag does not roll back persisted records.

Production enabling, continuous scheduling, approvals, lifecycle mutations and business writes are not part of this change. The existing cron and `RUN_SAFE` endpoint retain their behavior. The new supervision page is refreshed on demand and executes work only when the operator presses its control button.

Graph state is request-local; this integration intentionally has no LangGraph checkpointer, interrupt/resume endpoint or automatic retry. Supabase mission, handoff and work-evidence records remain durable. If an RPC response is lost, inspect `GET /api/missions?missionId=...` and its work evidence before retrying. A completed handoff is never selected again. Submitted work can be reconciled through existing independent review controls. A durable LangGraph checkpointer must be qualified separately before enabling resumable graphs.

## Verification

`npm ci --ignore-scripts --no-audit --no-fund`

`npm run test:langgraph` exercises the actual StateGraph, separate maker/checker roles, persisted readback, rejection and tampering, disabled control, qualification floors, response loss, kill switch, source failure and authenticated Cloudflare API wiring. Fixtures emulate the durable service; these are not live Supabase qualification claims.

`npm test` runs the baseline platform/web checks and the graph tests. `npx wrangler deploy --dry-run --config wrangler.jsonc --outdir .wrangler-dry-run` verifies the Worker bundle without deployment. Dependencies are pinned in the root lockfile; CI installs them before testing or bundling.

Primary reference: https://docs.langchain.com/oss/javascript/langgraph/graph-api
