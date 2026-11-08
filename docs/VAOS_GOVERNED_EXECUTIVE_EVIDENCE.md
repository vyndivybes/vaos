# Governed Executive Evidence / dashboard phase 1

## Audience and decision
A founder can inspect which signed VYNDI departmental source records are currently returned for a selected 7/30/90-day window, separate the source-level HOLD/UNAVAILABLE/PARTIAL states from OBSERVED, and drill into the related VAOS workspace for review.

## Visual system
An original responsive executive evidence room: source status chart, four summary cards, filterable department register, provenance inspector, and deterministic review priority. Styling is integrated with the Kinetic Intelligence theme in PR #505. Charts use only observed source statuses, not example business metrics or inferred forecasts.

## Authenticity
The UI calls the existing founder-only, read-only `/api/enterprise-bi` endpoint via the signed VYNDI OS service bridge, using its bounded departmental mode (not the executive-only aggregate mode, which deliberately returns zero department rows). It does not synthesize balances, revenue, operational rates, CRM conversion, headcount, inventory or predictive claims. An OBSERVED source status is not certified business completeness. Forecasts and Monte Carlo illustrations remain in their separately labeled scenario modes.

## Interaction
- User-triggered read, with a selectable 7/30/90-day India-local reporting window
- Source status filter, search and interactive status chart selectors. Related-source partial coverage overrides a primary-source OBSERVED label for readiness display
- Readable department statuses, source references, related-source coverage, primary-ledger period record counts, current primary-ledger attention counts, and source timestamps/revisions when available. Counts from heterogeneous or overlapping ledgers are never summed
- Review-oriented drill-down to existing founder-authorized modules
- Explicit HOLD, empty, invalid source, expired session and read failure states
- Client request cancellation when leaving the view, and no browser persistence or invented demo records
- Separate on-demand executive aggregate read (7 canonical CRM, HR and dispatch families). Each independently qualified family has its own count, status breakdown, exception highlights and source navigation; no cross-family sums or arbitrary forecast claims. The executive aggregate read is current source state and not filtered by the selected reporting period.

## Verification and release gate
Run Node's `--test` on `apps/web/lib/executive-evidence-model.test.mjs` and `apps/web/executive-evidence-ui.test.mjs`, then the existing `npm run test:web`, `verify:web` and Cloudflare bundle smoke. Verify desktop, mobile, keyboard and reduced-motion acceptance in a founder-authenticated browser. This code is an unmerged review branch; production source data and signed bridge health have not been independently verified here.

## Subsequent evidence requirements
Source-backed revenue, cash runway, CRM conversion, inventory shortages, manufacturing OEE, quality CAPA trend, logistics ETA and HR capacity charts require authoritative metric definitions, consistent time series, approved denominators and actual source reads. Do not retrofit these from synthetic chart examples.
