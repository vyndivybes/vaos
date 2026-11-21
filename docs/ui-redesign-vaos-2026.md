# VAOS JARVIS — Taste v1 frontend modernization

Status: **Pilot foundation branch; not production-qualified**  
Decision date: 2026-11-21  
Scope: `vyndivybes/vaos` only; **no VYNDI OS code or deployment changes**

## Design contract

- `DESIGN_VARIANCE=8`: confident asymmetric composition, purposeful whitespace, clear typographic hierarchy.
- `MOTION_INTENSITY=5`: restrained, interruptible feedback; avoid perpetual visual noise.
- `VISUAL_DENSITY=5`: operator-readable summaries, concise tables, evidence-first status and drilldowns.
- Impeccable principles: audit, critique, simplify, polish, accessibility and responsive verification.
- Emil Kowalski principles: visual continuity, spring-like easing where warranted, explicit interactive states, and reduced-motion fallback.
- Three.js: **optional, later stage only**; never required for login, executive summary, BI or mission acceptance.

## Architectural constraints

1. Continue with existing HTML, JavaScript modules and CSS in `apps/web/`. Do not rewrite the site into React.
2. Preserve Cloudflare Worker entrypoint and API handlers, authentication, all actor permissions, evidence semantics and mutation gates.
3. Use the existing font asset and CSS design tokens. Avoid a new UI framework or paid service.
4. Separate simulation, demonstration and authoritative source data in every user-visible state.
5. Do not bury `HOLD` or `SOURCE_UNVERIFIED` messages behind decoration.
6. Preserve all existing links and entry points until route parity is verified.
7. Prefer static backgrounds and accessible 2D renderers over a default live WebGL canvas.

## Existing verified frontend seams

- Shell/navigation: `apps/web/vaos-shell.mjs`, `apps/web/vaos-shell.css`.
- Shared theme: `apps/web/vaos-global-theme.css`.
- JARVIS home: `apps/web/workspace.html` and its existing scripts.
- Spatial visuals: `apps/web/spatial-command.html`, `apps/web/scene-parallax.mjs`.
- Knowledge: `apps/web/neural-knowledge.html`.
- Existing regression tests: `apps/web/vaos-kinetic.test.mjs`, `apps/web/spatial-command-shell.test.mjs`.

## Five-phase delivery

### P1 — Plan

- [x] Inspect repository framework, routes, shell, theme and existing tests.
- [x] Document VAOS-only design parameters and safety boundaries.
- [ ] Capture independent production screenshot and performance baselines for phone, tablet and desktop.
- [ ] Inventory route visibility and operational data states against current production.

### P2 — Prepare

- [x] Introduce explicit 8/5/5 CSS design controls.
- [x] Simplify top-level navigation without removing specialist destinations.
- [x] Add responsive nav and reduced-motion behavior.
- [ ] Audit conflicts among existing CSS layers and extract reusable styles without breaking route-specific rendering.
- [ ] Define loading, error, empty, disabled, verified and unverified visual semantics.

### P3 — Proceed

- [ ] Redesign JARVIS founder command as a single coherent, working screen.
- [ ] Restore visual hierarchy to evidence-first KPI, agent health, priorities, approvals and source provenance.
- [ ] Visual review of 375px, 768px, 1440px layouts.

### P4 — Perform

- [ ] Apply navigation, charts, forms and evidence treatments to all remaining VAOS pages.
- [ ] Keep motion primarily to 140–220ms feedback and use existing reduced-motion media handling.
- [ ] Prototype selective Three.js knowledge graph behind a feature flag, loading only on the spatial knowledge page.
- [ ] Require 2D fallback, GPU disposal, keyboard alternatives and no fabricated graph edges.

### P5 — Persist

- [ ] Run `node --test apps/web/vaos-design-foundation.test.mjs apps/web/vaos-kinetic.test.mjs apps/web/spatial-command-shell.test.mjs`.
- [ ] Run `npm run test:web`, `npm run verify:web`, relevant security tests and `npm run lint`.
- [ ] Perform browser accessibility, keyboard, layout and production API smoke checks.
- [ ] Only after qualification, merge with branch protection and deploy to Cloudflare with rollback and SHA evidence.

## Performance and accessibility gates

- 375px, 768px and 1440px screenshots with no horizontal overflow or inaccessible controls.
- Reachable, visible focus on every navigation/action item; Escape closes the directory.
- Honor `prefers-reduced-motion: reduce` and low-power/touch devices.
- No Three.js cost in login, basic command pages or 2D analytics.
- Target LCP <= 2.5s, INP <= 200ms and CLS <= 0.1 under a documented test environment.
- No behavioral change to business authorization, read/write gates or audit evidence.

## Rollback and non-goals

The entire initial foundation is isolated on `design/vaos-taste-v1-foundation-20261121`. Do not promote the branch before tests and independent UI review. Revert the PR if it causes layout regressions.

Non-goals: modifications to VYNDI OS; backend model changes; new authentication systems; new Cloudflare variables/secrets; speculative GPU infrastructure; removal of operational routes.
