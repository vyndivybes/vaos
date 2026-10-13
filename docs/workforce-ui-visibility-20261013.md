# VAOS founder workforce visibility — 13 October 2026

## Purpose

Make already-shipped workforce, mission and founder tools visible from the main
VAOS command page. This is a discoverability and release-transparency change,
not a workforce qualification or business-action release.

## Main entry and navigation

- `/workspace` / `/workspace.html`: Founder Operations hub with direct links.
- `/workforce-analytics.html`: 16 digital employees, records and honest evidence holds; founder-only API.
- `/mission-status.html`: mission lookup and independently reviewed progress.
- `/agent-supervision.html`: registered agent lifecycle, qualification and handoffs.
- `/founder-console.html`: founder command drafts and report preview, not automatic agent dispatch.

The main command-page agent cards show **all observed control-plane agents**,
not an invented count of qualified digital employees. This is not the same
population as the 16-person digital employee register.

## Implementation-to-acceptance separation

The on-screen implementation map links relevant GitHub PRs and is dated,
not a live status API. The statuses deliberately distinguish:

1. Source implemented / asset shipped.
2. Authenticated live UI and API acceptance.
3. Independently reviewed evidence and operational authority.

The latter two do **not** follow automatically from a merge, tests or deployment.
Do not invent training, forecasts, audit passes, CAPA closure or delivered agent
messages where evidence is absent.

## Release checks

- `npm test` including the static browser-workspace discovery regression.
- `npx wrangler deploy --dry-run --config wrangler.jsonc` bundle and asset inspection.
- Confirm successful exact-head CI / no blocked required checks before merge.
- Independently confirm Cloudflare main Worker deployment after merge.
- Signed-in founder acceptance: open workspace, follow each of the four links,
  inspect 16 individual records, verify that missing ledgers show explicit HOLD,
  refresh and switch employees, and confirm non-founder gets API 403.
- Test responsive layout and browser console/network with a real authenticated session.

## Known business commissioning holds

Live employee supervision and all-role independent qualification, outbound
employee messaging, audited production work outputs, authenticated final
dashboards, qualifying forecast input/backtests, and QA CAPA retests remain
separate acceptance gates. No production role, schema, data or permission
changes are part of this UI increment.
