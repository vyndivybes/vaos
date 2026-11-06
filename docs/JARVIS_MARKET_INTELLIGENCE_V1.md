# JARVIS Market Intelligence v1 — implementation and limits

**Entry point:** authenticated founder → `/market-intelligence.html` (after Cloudflare deployment).
**API:** `/api/market-case-studies` (authenticated founder, read-only preview and explicitly consented archive).
**Source:** `intelligence/market-case-study.mjs` (pure deterministic maths and source metadata validation).
**Controlled case:** `knowledge/business-cases/BUSINESS-CASE-003.md`, linked to CASE-001 and CASE-002.

## Functional contract

1. **Live scan:** `GET /api/market-case-studies?q=<public topic>` fetches a bounded Google News RSS search with fixed Google domain, manual redirect handling, 3.5-second timeout and a 45-day recency screen. Output is **unverified headline context only**; no source contents, pricing, sales totals, TAM, supplier authority or forecasts are certified. Founder must not paste private briefings, credentials or customer details into this third-party search query.
2. **Study preview:** `POST /api/market-case-studies` with `{"operation":"PREVIEW","case":{...}}` computes a standard report from a bounded input object, with 0–30 HTTPS-only source references (publisher/date/claim) and optional explicit scenario assumptions. Missing sources/model information stays on HOLD.
3. **Scenario model:** Three defined demand cases, single-unit contribution, monthly revenue, variable and fixed cost and operating-surplus calculations. Negative unit contribution cannot yield a positive break-even. No direct model-call cost or paid external intelligence API.
4. **Consent-based archive:** `POST` with `{"operation":"SAVE","confirm":true,"case":{...}}` recomputes the study on the server and stores an immutable timestamp-UUID JSON version under `VAOS_ARTIFACTS` R2 prefix `jarvis/founder/market-cases/v1/<id>/<version>.json`. Each version retains report, rendered Markdown, provenance flags and timestamp. Replays via founder-only GET. No existing case or transaction is modified.
5. **Illustrated UI:** orbital/relationship visual, public signal cards, scenario contribution/operating-surplus visualizations, complete report view, source register, R2 archive listing and Markdown export. All external text is rendered through `textContent`; no raw HTML from fetched headlines.
6. **Link:** Founder Command menu and related-workspace panel.

## Acceptance and explicit holds

- Dedicated free hosted GitHub workflow: `.github/workflows/jarvis-market-intelligence.yml`.
- Standard web test script also includes the market engine, API security and UI wiring tests.
- Tests do not prove independently verified competitor quotations, economic market sizing, published-source content correctness, fully autonomous multi-source retrieval, RAG embeddings, repeat scheduled research, external revenue qualification or the live Cloudflare endpoint.
- Existing CASE-001 and CASE-002 are repository references to private files; storing links is **not live RAG ingestion**.
- No autonomous business mutations or unrestricted agent access; founder authorisation and explicit save consent are retained.

## Qualification checklist

- [ ] Focused market workflow **PASS** on head SHA (not just older commit).
- [ ] Standard `npm run test:web`, Cloudflare smoke and existing PR checks **PASS** on same head.
- [ ] Cloudflare preview or production endpoint response verified with actual founder session and R2 permissions.
- [ ] External Google News feed availability and quota behavior checked in deployment environment.
- [ ] Create/preview/save/list/replay/export journey verified in a real browser.
- [ ] Source publications independently rechecked and, where numerical data is used, cited with scope and date.
- [ ] Release/merge approved only after all applicable non-market security and recovery gates remain green.

## Follow-on work for full autonomy

- Source adapters to official trade datasets, company annual accounts and competitive pricing (source consent, access control, date and unit normalization).
- Claims-to-source independent verification, contradictory evidence detection and reproducible evidence snapshots.
- Actual **TAM/SAM/SOM** models by defined customer geography and tier, based on qualified denominators.
- Reconciled supplier BOM, finance/CRM/operations connectors, confidence-bounded forecasts and cash/working-capital scenarios.
- Governed mission queue for recurring research, review/correction and versioned citations, tenant isolation and retrieval/semantic indexes.

Until these gates are independently demonstrated, classify this implementation as **FOUNDER RESEARCH PILOT**, not complete autonomous analyst or production-verified forecasting.

## v1.1 add-on: supply-chain BCP stress (2026-11-06)

The existing founder market case builder also accepts an **optional** `continuity` object.
Provide all six bounded values: `cashReserve`, `demandDropPct`,
`variableCostIncreasePct`, `supplierRecoveryDays`, `inventoryCoverDays`,
and `recoveryCost`. Financial unit-economics inputs must also be present.
The builder evaluates one conservative **30-day stress window** using base demand,
rounded-down sellable units, unavailable supplier days exceeding inventory cover,
increased variable cost, unchanged monthly fixed cost and one-off recovery cost.

Outputs: modeled supply-interruption days, stressed units, first-month and recurring
operating-surplus estimates, cash after recovery, hypothetical cash-loss coverage
months and an explicit recovery funding HOLD if cash is insufficient.
A negative first-month result, recovery funding shortfall or <3 months modeled
cash-loss coverage downgrades the case recommendation to HOLD.
Cash-loss coverage is not a validated business cash-flow forecast.
No daily scheduling, alternative-source lead time, receivables, taxes, CAPEX,
payables, working capital, customer orders, supplier receipts or currency exposure
is incorporated. Values are supplied assumptions, not observed operational facts.

Validation: `npm run test:market` and the GitHub market qualification workflow
include the continuity engine and tests. Archive versions persist this new
analysis inside the existing immutable case report; older versions without it
remain readable. No new secrets, third-party paid feeds, new storage writes,
new production finance/procurement capability or background job are introduced.

**Release evidence remains required:** same-head CI green, independent browser
and Cloudflare acceptance, and verification of any external market measurements.

## v2: free public-data observatory and competitor watch (6 Nov 2026)

New founder-only read-side endpoint: GET \`/api/market-public-intelligence\`
returns the latest R2 snapshot. POST with same-origin JSON
\`{"operation":"REFRESH","confirm":true}\` fetches a new bounded snapshot.
The new section on \`/market-intelligence.html\` renders these items and
uses safe DOM text/link construction, never embedded upstream HTML.

**Fixed sources, scopes, and units:**
- World Bank Indicators API v2 (keyless): India annual GDP growth
  \`NY.GDP.MKTP.KD.ZG\` and consumer inflation \`FP.CPI.TOTL.ZG\`,
  values in percent per annum, source year retained.
- UN Comtrade public preview (keyless, limited coverage and rate quotas):
  current India reporter code 699, partner world 0, HS 8712, imports,
  latest three completed annual periods, trade value in current USD.
  **HS 8712 includes complete non-motorized bicycles; NOT Indian carbon
  frameset sales, an India addressable-market denominator, units sold,
  landed costs, import tariffs, or competitor carbon-fiber frame pricing.**
- GDELT DOC 2 JSON \`artlist\` query for a fixed three-brand watchlist:
  Trek Bicycle, Giant Bicycles and Canyon Bicycles. Bounded recent headline
  context only; no quotes, market share, published product price, revenue
  certification or source-article truth guarantees.

**Daily schedule and security:** Existing Worker hourly cron, gated to
01:00 UTC and the explicit read-side variable
\`VAOS_MARKET_MONITOR_CONTROL=founder-daily-readonly-v1\`.
No paid plans, credentials, arbitrary user-supplied outbound URLs or direct
business writes. R2 latest path:
\`jarvis/founder/market-intel/v2/latest.json\`.
Past successful snapshot remains if all feeds fail; partial source failure
is explicit. A first run establishes baseline; future runs count new public
article URLs, **not verified competitive price changes**. No alerts are sent
externally; founder reads the snapshot.

**Forecast truth contract:** For any observed complete consecutive annual
World Bank indicator series of >=8 years, use three walk-forward holdouts
to select the last observation vs mean of last three and report MAE.
This is an *indicator extrapolation*, not a validated market/demand forecast,
nor a forecast of carbon bicycle sales. Even with a successful backtest,
\`forecastQualified=false\`, \`demandForecastQualified=false\` and
\`independentlyReconciled=false\` until independent target-market observations
and out-of-sample verification are available. No claimed TAM/SAM/SOM.

**Qualification:** CI runs adapter parsing/failed-data guards, source scope
and fixed-host safety, observable annual-series backtest, daily snapshot
idempotency, authentication, cross-origin rejection and DOM contract tests.
Live R2 persistence, Cloudflare deployment, upstream service quotas, browser
and authenticated founder session remain independently qualified release
conditions, not assumed from repository tests.

### GDELT query budget

The three-brand watchlist uses **one combined OR query** per daily scan,
not three simultaneous DOC API requests. This respects the conservative
public-service request limit and reduces free-tier throttling. Articles
without a recognisable brand term in the title are not attributed to a
watchlisted competitor. Headline matches are not product/price proof.
