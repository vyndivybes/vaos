# VAOS Kinetic Intelligence — Editorial Redesign

## Visual reference

Visual presentation inspired by the public portfolio at https://www.sashamartynchuk.com/ (reviewed November 8, 2026). This is an **original VAOS implementation**, not a copy of the site's source code, artworks, font files, screenshots, animations, or branding.

The design uses an almost-black canvas, oversize condensed headings, off-white text, sharp surface geometry, a lime interaction accent, an illustration gallery and restrained motion. All interface illustrations are original CSS.

## Scope

- All current 17 \`apps/web/*.html\` files load \`/vaos-kinetic.css\` as the final CSS link.
- Founder workspace has three featured entry points: Second Brain, Visual Command, and JARVIS Founder Command. The CSS artwork is decorative and **does not depict real-time telemetry**.
- Existing navigation, sessions, search forms, source models, chart rendering, data provenance, HOLD status, and permission checks remain in their original modules.
- No duplicate dashboard iframe. No paid runtime or third-party asset requirement.
- Responsive navigation and reduced-motion rules are included.

## Boundaries

This visual update **does not commission a new source or validate operational state**. The Graphify source snapshots and all knowledge connectors retain their existing readiness status. CSS must never imply approval, execute work, or change the truth of financial, engineering or business records.

## Acceptance and rollback

1. Run \`node --test apps/web/vaos-kinetic.test.mjs\`, \`npm run test:web\`, \`npm run verify:web\` and \`npm run lint\`.
2. Inspect all pages at 1440 px and 390 px widths. Verify keyboard focus, status contrast, field interactions, tables, SVG charts, and dialogs.
3. Verify authenticated links to all three featured workspaces and confirm no source status is relabeled as LIVE.
4. Run the Cloudflare build/dry-run and controlled release; attach exact SHA and browser evidence.
5. If needed, remove the final \`/vaos-kinetic.css\` links to revert the visual skin without altering application logic.
