# VAOS Architecture

## Core principle

**Agents propose intentions; VYNDI governance authorizes effects.**

## Execution path

```text
User / Event
   ↓
Orchestrator
   ↓
Specialist Agent / Durable Workflow
   ↓
Tool Registry / MCP / Internal API
   ↓
Policy Engine
   ↓
RBAC + ABAC
   ↓
Autonomy Governor
   ↓
Decision / Approval
   ↓
Execution Adapter
   ↓
Verification
   ↓
Evidence + Audit + Digital Thread
```

## Major domains

- `apps/`: user interfaces and operational consoles
- `agents/`: orchestrator and specialist agents
- `platform/`: runtime, events, decisions, policies, workflows, approvals
- `mcp/`: MCP servers, tools, resources, events, permissions
- `intelligence/`: RAG, graph, forecasting, optimization, simulation, process mining
- `digital-thread/`: requirements, PDM, BOM, verification, evidence, change control
- `governance/`: authority, RBAC/ABAC, approvals, compliance, risk, audit
- `integrations/`: external adapters
- `compute/`: WASM, WebGPU, sandboxed and heavy compute
- `packages/`: shared contracts, schemas, types, UI, telemetry
- `workflows/`: durable business and engineering workflows
- `tests/`: qualification across boundaries

## Agent contract

Every agent must expose the same lifecycle:

```text
observe → analyse → recommend → prepare → execute → verify
```

Execution is optional and governed by capability-specific authority.

## Event-first operation

Representative events:

```text
ENGINEERING.REVISION_CREATED
ENGINEERING.FEA_FAILED
QA.NCR_OPENED
QA.CAPA_OVERDUE
PROJECT.MILESTONE_SLIPPED
FINANCE.BUDGET_THRESHOLD_EXCEEDED
SECURITY.LOGIN_ANOMALY
CI.TEST_FAILED
RELEASE.GATE_FAILED
```

## Design rules

1. Contract-first interfaces.
2. Additive compatibility by default.
3. Validate third-party inputs.
4. No direct privileged side effects from model output.
5. All effects pass through policy and authorization.
6. High-risk actions require explicit approval.
7. Every action is observable and auditable.
8. State-changing retries must be idempotent.
9. One repository does not imply one runtime.
