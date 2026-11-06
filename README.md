# VAOS — Vāyú Shastr Agentic OS

VAOS helps people understand what's happening in their business, investigate the evidence and decide what to do next. It brings together operational views, research tools and specialist agents. **An agent's ability to suggest an action is not permission to carry it out.** Every change still follows the applicable authority and audit rules.

This is the private development monorepo for VAOS and the VYNDI enterprise systems it supports.

## Start here

If you're new to the project, follow this path:

1. **Understand the boundaries.** Read [CONTRIBUTING.md](CONTRIBUTING.md), then the [human-facing writing guide](docs/WRITING_FOR_PEOPLE.md). Actions need explicit authority; reports and simulations do not authorize spending, orders or engineering releases.
2. **See a working area.** The founder-facing Market Intelligence page lives in `apps/web/market-intelligence.html`. Its [implementation and limits](docs/JARVIS_MARKET_INTELLIGENCE_V1.md) describe how sources, assumptions and archives are handled.
3. **Run the checks.** With Node.js 22 and the lockfile installed, run `npm ci --ignore-scripts --no-audit --no-fund`, then `npm run test:market` for the research module or `npm run test:web` for wider web coverage. Run `npm test` before proposing a production release.
4. **Make a focused change.** Create a short-lived branch, add or update tests, open a pull request and attach evidence. Never place production credentials in source control.

## What works today

The repository includes implemented and tested code for founder-facing workspaces, case-study research, Market Intelligence source adapters, scenario calculations, agent governance and several operational integrations. Its Market Intelligence module can read public datasets, track recent competitor news links, run *indicator-only* backtests and store consented, versioned research.

That means **the software paths exist and have automated qualification checks**. It does not mean every external service is healthy, every business record is complete or every forecast is independently validated.

### When the screen says HOLD

**HOLD means there isn't enough reliable evidence or authority to proceed.** It is not the same as a program crash. Look for the reason: a missing source, incomplete assumptions, a failed verification or an action that needs approval. Investigate the cause and rerun the relevant qualification; do not remove a HOLD label to make a dashboard look green.

Other useful terms:

| Label | What it means |
|---|---|
| Observed | A source returned a record within the specified scope. It is not necessarily independently verified. |
| Scenario | A calculation from supplied assumptions, not a prediction or a confirmed business result. |
| Backtested indicator | A historical data model checked against held-out years; not proof of product demand. |
| Read-only | The path does not authorize a business transaction. |
| Approved | A specific authorized decision or operation passed its required controls; this does not grant permission elsewhere. |

## What still needs evidence

A production deployment and a passing CI run are different things from operational proof. For example, a competitor headline isn't a verified price quote, an import total isn't the addressable carbon-frameset market, and a spreadsheet forecast isn't a booked sale. Source access, customer-specific data, supplier quotations, authenticated browser use and recovery behavior must be checked separately before those claims are made.

Keep pilot, tested, deployed and independently verified claims distinct in documentation and in the UI.

The visual and UI consistency contract is [one VAOS theme and one workspace per page](docs/VAOS_VISUAL_WORKSPACE_STANDARD.md). It prohibits nesting a second dashboard inside the Visual Command page.

## Where the work lives

| Directory | Purpose |
|---|---|
| `apps/` | Interfaces, workspaces and operational consoles |
| `agents/` | Orchestration and specialist agents |
| `platform/` | Shared runtime, workflows, events, policies and services |
| `mcp/` | MCP tools, resources and permission adapters |
| `intelligence/` | Research, graph, scenario, forecasting and analytical logic |
| `digital-thread/` | Requirements, BOM, evidence and change control |
| `governance/` | Roles, authority, approvals and audit trails |
| `integrations/` | Adapters for external systems |
| `compute/` | Sandboxed and compute-intensive workloads |
| `packages/` | Shared types, contracts, components and telemetry |
| `workflows/` | Durable business and engineering workflows |
| `tests/` | Integration, security, performance and end-to-end qualification |
| `docs/` | Architecture, operations, release notes and decision records |

This is a **monorepo, not one single deployment**. Components can share contracts while releasing independently.

## Who can do what

| Level | Authority |
|---|---|
| L0 | Observe |
| L1 | Analyse |
| L2 | Recommend |
| L3 | Prepare an action |
| L4 | Execute after the required approval |
| L5 | Execute autonomously only inside a separately granted policy |

Authority is granted per capability. It is never a blanket permission for all agents or services.

## Release and deployment

The current controlled release path is [`.github/workflows/jarvis-controlled-release.yml`](.github/workflows/jarvis-controlled-release.yml): it verifies an exact `main` commit, runs the full regression suite and deploys the existing Cloudflare Worker through a protected production environment. Other GitHub workflows check bundles or specific capabilities; a dry-run or green test **is not** proof of production deployment.

The Worker configuration is in `wrangler.jsonc`. Its consolidated feature-flag binding helps preserve the Cloudflare free-plan variable limit. Do not introduce paid services, new secrets or permission changes as part of documentation or UI cleanup.

For the market research module, start with [its source and qualification notes](docs/JARVIS_MARKET_INTELLIGENCE_V1.md). Use live deployment records and an authenticated session to verify what actually works in production.

## Contributing

Write for the person who has to operate and maintain the system next. Prefer clear purpose, honest status messages, examples that can be reproduced and links to the evidence. Keep technical codes stable for diagnostics, but explain their meaning in everyday language. See [CONTRIBUTING.md](CONTRIBUTING.md).
