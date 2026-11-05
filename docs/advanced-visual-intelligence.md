# Advanced Visual Intelligence — acceptance and source authority

## Scope

VAOS `/visual-command.html` now links to `/visual-intelligence.html?viz=<mode>`, which renders eight self-contained visualization modes:

| Mode | What it actually renders | Operational limitations |
| --- | --- | --- |
| `sankey` | Validated acyclic weighted flows, scaled SVG links, source/target details | No inferred material or ledger transfers |
| `factory` | Orbit/zoom, selectable 3D isometric process cells, scenario station states | **Not** live PLC/SCADA or connected machine digital twin |
| `simulation` | Seeded monthly Monte Carlo cash balance, P10/P50/P90 bands, reproducible distributions | Assumptions only; not a certified forecast |
| `heatmap` | Numeric scenario matrix with genuinely missing cells | No real OEE, utilization or staffing inferred |
| `waterfall` | Exact cumulative driver arithmetic for signed scenario changes | Not automatically a reconciled P&L |
| `funnel` | Ordered stages with bounded conversion math | Not an observed CRM conversion pipeline |
| `timeline` | Scaled, validated scenario schedules | Not committed production work orders |
| `logistics` | User-supplied coordinate scatter and straight-line connections | Not routing, optimization, live GPS or ETA |

These views require an authenticated VAOS session. They use native browser Canvas/SVG only, with no subscription or new backend credentials.

## Evidence boundaries

The default data is `SYNTHETIC_DEMO`. It is intentionally fictional and is never mapped onto enterprise KPI labels as actuals. Imported JSON data is forcibly downgraded to `USER_SUPPLIED_UNVERIFIED`, regardless of what the input claims. The app has no POST endpoint and writes no business records.

A button checks founder-authorized, signed `/api/enterprise-bi?employee=all&executive=1` source reachability. Its response is displayed separately; connection or record count is **not** displayed as physical throughput, financial profit, machine availability, route distance or other actual values.

The Monte Carlo panel accepts monthly demand, capacity, unit price, unit variable cost, fixed costs, opening cash, monthly CAPEX, demand volatility, duration, iteration count and deterministic seed. Its result is a hypothetical *cash-balance* scenario (not net profit, accounting free cash flow, investment advice, or a tax calculation). Simulations are not stored.

## Local JSON structure

Copy the synthetic example from the studio to obtain the complete current schema `VAOS_VISUAL_SCENARIO_V1`. Required object keys:

- `sankey.nodes` and `sankey.links` (directed, acyclic, strictly positive link values; labelled units)
- `factory.stations` (`id,label,x,z,y?,status?`; any states are **simulated**)
- `heatmap.columns` and `heatmap.rows[].values` (use actual JSON `null` for unknown; do not replace it with zero)
- `waterfall.steps[].change` (signed delta)
- `funnel.stages[].value` (non-increasing)
- `timeline.tasks[].start/end` (calendar dates)
- `logistics.points[].lat/lon` (coordinates, not a road route)

The browser validates all visualization data as one atomic import. Invalid or oversized JSON is rejected without replacing the last valid scenario. Content is rendered using DOM/SVG text nodes, not HTML from the import.

## What still needs commissioning for genuine operational intelligence

A **machine-connected factory digital twin** requires: measured plant layout/assets, approved asset identifiers, OPC-UA/PLC/SCADA/MES connector, timestamped signal quality, calibration and sensor provenance, quality and production transaction reconciliation, source health monitoring, authorizations and site acceptance tests.

A **real Sankey inventory flow** requires independently matched PO, GRN, lot genealogy, work orders, stock movements, scrap and dispatch quantity with common units, accounting cutoffs and reconciliation. Counts of source records or incomplete ontology objects cannot be rebranded as flow quantities.

A **predictive financial forecast** requires qualified posted ledgers, historical demand, approved budgets, cost assumptions, model back-testing, bias analysis and sign-off. A hypothetical Monte Carlo output alone does not satisfy these gates.

## Qualification

The repository tests `apps/web/lib/advanced-visual-model.test.mjs`, `apps/web/lib/predictive-simulation.test.mjs` and `apps/web/visual-intelligence.test.mjs` are included in `npm run test:web`. CI uses `npm test` in `web-smoke`, plus Cloudflare bundle smoke. Live authenticated browser acceptance and real asset telemetry commissioning are separate and must not be inferred from a green repository build.
