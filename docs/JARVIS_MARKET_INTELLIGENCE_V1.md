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
