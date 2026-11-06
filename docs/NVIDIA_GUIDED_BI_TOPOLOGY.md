# VAOS NVIDIA-guided evidence topology — initial integration

## What is implemented

The existing authenticated BI Studio now provides a **source-backed evidence topology** in addition to its existing bars and tabular view. It does not embed another application or duplicate navigation. The topology presents source → department → defined metric → evidence state with source labels and inspectable drill-downs.

It uses the existing `/api/enterprise-bi` and `/api/workforce-analytics` authenticated reads, the saved `bi-model.mjs` metric definitions, and the global VAOS design tokens. The chart selection remains `bar` / `table` in persisted definitions so the byte-identical VYNDI shared contract is not changed. Topology vs bars is a local presentation preference, **not saved** or shared.

- **Measured:** safe non-negative integer returned with a qualified `REAL` state.
- **Observed empty:** an actual reported zero (state `EMPTY`, or `REAL` with value zero).
- **Unavailable:** HOLD, stale, unobserved, invalid or unsupported source data. This is **not zero**, and numeric values attached to unqualified states are suppressed.
- **Coverage:** counts of report rows by evidence state, not sums of business output. Status rows and different source ledgers may overlap.
- **Bounded rendering:** maximum 64 topology cells are rendered. The view reports any omitted cells; the underlying data-table view still provides all rows.
- **Read-only:** drill-down changes the selected authorized department in the current BI Studio; it performs no mutation.

## NVIDIA skills and infrastructure boundary

NVIDIA's live skills catalog identifies `nvidia-ontology-query`, `nvidia-ontology-management` and `accelerated-computing-cudf`. These are development/agent workflow skills, **not** an embedded dashboard renderer. This first integration applies their semantic-ontology principles to VAOS's existing metric/source contract without adding GPU hosting, NIM endpoints, external tokens, proprietary SDKs, or paid runtime.

The skills were **not embedded into the Cloudflare runtime**. Before enabling an external ontology engine or GPU acceleration, independently qualify authentication, pricing/free-tier limits, access governance, schema mappings, latency and fallback. Retain CPU/SQL as the baseline until workload evidence warrants optional GPU acceleration.

For a compatible external development agent, approved installation commands are:

```bash
npx skills add nvidia/skills --skill nvidia-ontology-query --global --yes
npx skills add nvidia/skills --skill nvidia-ontology-management --global --yes
# Optional, only on a compatible GPU-equipped host:
npx skills add nvidia/skills --skill accelerated-computing-cudf --global --yes
```

Installing a development skill does not establish operational connectivity or source-qualified forecasts.

## Acceptance

```bash
node --test apps/web/bi-evidence-topology.test.mjs
npm run test:bi
npm run test:web
npm run verify:web
npm run lint
```

Then check authenticated BI Studio on desktop/mobile, switch **Evidence topology ↔ Evidence bars ↔ Data table**, click department cells, verify all source statuses and permissions, and check reduced-motion and keyboard navigation. Full production acceptance requires verified Cloudflare deployment and real authorized source receipts; CI alone cannot prove it.

## Next integration gate

Qualify the VYNDI ontology data contracts and independent measured facts before adding revenue, profit, OEE, CRM conversions, predictive forecasts or company-wide composite KPIs. Never interpolate missing operational values or present scenario illustrations as live enterprise results.
