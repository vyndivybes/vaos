# VAOS Architecture

## Core principle

**Agents propose intentions; VYNDI governance authorizes effects.**

VAOS is an industry-agnostic autonomous enterprise operating architecture. Domain applications extend the same governed core rather than creating parallel control systems.

## Enterprise planes

Experience → Organization → Agency / Digital Workforce → Intelligence → Decision + Simulation → Knowledge / Digital Thread → Governance → Integration / Execution → Data / Reality

These are logical boundaries, not a requirement for separate deployables.

## Execution path

Human / Event / Mission
→ Outcome / Orchestrator
→ Digital Employee / Specialist Agent / Durable Workflow
→ Context + Skill + Tool Discovery
→ Intelligence / Decision Routing
→ Policy Engine
→ RBAC + ABAC + Capability Authority
→ Autonomy Governor
→ Decision / Approval
→ Execution Adapter
→ Independent Verification
→ Evidence + Audit + Digital Thread

## Major domains

- apps: command surfaces and operational consoles
- agents: orchestrator and specialist agents
- platform: runtime, events, digital workforce, decisions, policies, workflows and approvals
- mcp: tools, resources, events and permission adapters
- intelligence: RAG, graph, routing, forecasting, optimization, simulation and process mining
- digital-thread: authoritative knowledge, requirements, configuration, verification and evidence
- governance: authority, RBAC/ABAC, approvals, qualification, compliance, risk and audit
- integrations: external enterprise and ecosystem adapters
- compute: sandboxed and heavy-compute execution
- packages: shared contracts, schemas, types, UI and telemetry
- workflows: durable business, engineering and mission workflows
- tests: qualification across boundaries

## Agent contract

Every agent follows:

observe → analyse → recommend → prepare → execute → verify

Execution is optional and governed by capability-specific authority.

## Digital Employee

A Digital Employee is a governed enterprise role, not merely a model session or tool-using agent.

The canonical passport contains identity, role, department, mission, responsibilities, responsibility contract, qualification level, skills, tools, KPIs, escalation paths, capability-specific authority and lifecycle state.

Lifecycle:

PROPOSED → TRAINING → QUALIFIED → ACTIVE → RESTRICTED → RETRAINING → QUALIFIED → ACTIVE → RETIRED

Qualification:

- Q0 experimental
- Q1 general
- Q2 business
- Q3 engineering
- Q4 high assurance

Qualification never grants execution authority by itself. Capability authority remains L0-L5 and is enforced separately by governance.

## Responsibility contracts

Standing responsibility is separated from transient prompts. A responsibility contract declares mission, expected outcomes, autonomous actions, approval-required actions, prohibited actions and escalation conditions. An action cannot occupy more than one authority bucket.

## Skills

Skills are versioned portable capabilities declaring identity, semantic version, risk class, minimum qualification, capabilities used and required evidence. Digital Employees consume skills; skills are not employees.

## Event-first operation

Representative events include:

- WORKFORCE.DIGITAL_EMPLOYEE.PROPOSED
- WORKFORCE.DIGITAL_EMPLOYEE.QUALIFIED
- WORKFORCE.DIGITAL_EMPLOYEE.ACTIVATED
- WORKFORCE.DIGITAL_EMPLOYEE.RESTRICTED
- ENGINEERING.REVISION_CREATED
- QA.NCR_OPENED
- PROJECT.MILESTONE_SLIPPED
- FINANCE.BUDGET_THRESHOLD_EXCEEDED
- SECURITY.LOGIN_ANOMALY
- CI.TEST_FAILED
- RELEASE.GATE_FAILED

Persistent work is activated by events and durable responsibilities rather than requiring a human prompt for every iteration.

## Design rules

1. Contract-first interfaces.
2. Additive compatibility by default.
3. Validate third-party inputs.
4. No direct privileged side effects from model output.
5. All effects pass through policy and authorization.
6. Qualification and authority are separate controls.
7. High-risk actions require explicit approval unless a future policy explicitly proves otherwise.
8. Every lifecycle transition and action is observable and auditable.
9. State-changing retries must be idempotent.
10. Models, agents and tools are replaceable; enterprise knowledge and evidence remain authoritative in VAOS.
11. Domain products extend the enterprise model; they do not redefine the core.
12. One repository does not imply one runtime.
