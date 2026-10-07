# VYNDI Agentic OS

Private development monorepo for the next-generation VYNDI agentic enterprise operating system.

## Mission

VYNDI Agentic OS is designed as a governed execution platform in which AI agents can observe, analyse, recommend, prepare, execute, verify, and record work within explicit authority boundaries.

**Core principle:** Agents propose intentions; VYNDI governance authorizes effects.

## Repository model

This is a **monorepo, not a monolith**. Source code lives together for contract consistency and traceability, while applications, workers, agents, compute jobs, and integrations may deploy independently.

```text
apps/            User-facing applications and operational consoles
agents/          Orchestrator and specialist agents
platform/        Shared agent runtime, workflow, event, decision and policy services
mcp/             MCP server, tools, resources, events and permission adapters
intelligence/    RAG, graph, forecasting, optimization, simulation and process intelligence
digital-thread/  Requirements, PDM, BOM, verification, evidence and change-control domain
governance/      Authority, RBAC/ABAC, approvals, compliance, risk and audit
integrations/    External systems and API adapters
compute/         WASM, WebGPU, sandboxed and heavy-compute execution
packages/        Shared types, schemas, contracts, UI and telemetry libraries
workflows/       Durable business and engineering workflows
tests/           Cross-cutting integration, E2E, security, performance and agent evaluations
docs/            Architecture decisions, security model and migration records
```

## Target platform capabilities

- Persistent specialist agents and orchestration
- MCP tools, resources and event-triggered agent workflows
- Decision routing with finite/controlled outcome sets
- Policy-as-code and explicit approval gates
- RBAC, ABAC and capability-specific authority levels
- Durable workflows and event-driven automation
- Enterprise knowledge graph and digital thread
- RAG and semantic retrieval with source authority
- Monte Carlo simulation and mathematical optimization
- Process mining, forecasting, anomaly detection and causal analysis
- Sandboxed computer/tool execution
- Verification, evidence capture, audit replay and time-travel state
- OpenTelemetry-grade observability for agents, APIs and workflows
- Independent deployments from a single source-of-truth repository

## Agent authority levels

| Level | Meaning |
|---|---|
| L0 | Observe |
| L1 | Analyse |
| L2 | Recommend |
| L3 | Prepare an action |
| L4 | Execute only after approval |
| L5 | Autonomous execution within policy |

Authority is granted **per capability**, never as an unrestricted blanket permission.

## Development lifecycle

1. Architecture and contracts
2. Platform foundations
3. Specialist agents
4. Integrations and MCP event fabric
5. Governance and execution controls
6. Intelligence and optimization
7. Qualification and security hardening
8. Release candidate freeze
9. Transfer to professional VYNDI/Vāyú Shastr ownership
10. Production deployment from the professional organization

## Deployment

VAOS uses **Cloudflare Workers Builds** as its deployment authority. The Cloudflare Worker is connected directly to the GitHub repository and deploys from the configured production branch using `wrangler.jsonc`. GitHub Actions remains a qualification and Cloudflare bundle-smoke layer; it does not hold Cloudflare deployment credentials.

## Repository status

**Bootstrap / architecture phase.** No production credentials belong in this repository. Development and qualification must use test or sandbox credentials.
