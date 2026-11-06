# VAOS visual workspace and shared theme

## One page, one workspace

Visual Command must **not** present another complete VAOS page inside an iframe. That was the source of the duplicated headers, menus, scrolling regions and picture-in-picture effect previously visible at `/visual-command`.

The main visual command screen now:

- Uses the existing SVG/canvas renderers *directly* for the Executive Cockpit, Sankey, factory concept, heatmap, cost bridge, CRM funnel, Gantt, logistics and Monte Carlo scenario.
- Keeps one top-level navigation header and one context menu.
- Lets drill-down actions switch the current native chart, without spawning a nested document.
- Opens specialized applications—knowledge graph, engineering viewer, agent supervision and governed finance/workforce systems—as full-page links so their own permission checks, context and accessible navigation remain intact.
- Keeps the existing BI Studio in its native host; no source data is copied into illustrative charts.
- Cleans up the 3D factory animation when leaving the view to avoid hidden loops and unnecessary resource use.

**Never infer live production values from graphics.** Synthetic demonstrations stay clearly marked. A signed source-read check does not authorize any finance, manufacturing, procurement, engineering or agent write.

## One theme, independent workflows

The shared `apps/web/vaos-global-theme.css` defines VAOS visual tokens for background, raised surfaces, text, borders, muted text, teal action accents, gold assurance cues, font and keyboard focus. It is loaded by the main founder, intelligence, knowledge, engineering, agent and visual workspaces. `styles.css` also imports it for legacy application shells.

Keep module-specific data visualizations and operational controls. The theme is a shared foundation, **not** a reason to replace useful workflows with decorative mockups.

### Review for all future visual changes

1. Does this page have one primary heading, one top-level navigation system and a clear way back?
2. Are scenario numbers visibly distinct from verified operational records and current authorization?
3. Do charts resize and remain readable on desktop and mobile, with reduced-motion respected?
4. Do long content sections scroll naturally without creating a smaller duplicate browser viewport?
5. Are buttons labeled as actions people understand? Does a HOLD provide a reason and next step?
6. Does changing a visualization release WebGL/canvas listeners, timers and animations?
7. Are references and external data rendered safely without dynamic HTML injection?
8. Do the UI tests, visual-command tests and Cloudflare bundle smoke checks pass?

**Regression contracts:** `apps/web/visual-command-shell.test.mjs`,
`apps/web/visual-command.test.mjs`,
`apps/web/visual-premium.test.mjs`,
`apps/web/visual-intelligence.test.mjs`.

## Production acceptance

Passing source and CI tests demonstrates code behavior but does not prove an authenticated browser journey. After deployment, use a founder session to verify the Visual Command default is a **single executive view without nested chrome**, then test graph navigation, factory rotate/zoom, simulation, the BI Studio and read-only specialist links. Record browser errors and accessibility findings separately from deployment status.
