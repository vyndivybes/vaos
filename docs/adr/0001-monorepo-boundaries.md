# ADR-0001: Monorepo with deployable boundaries

## Status

Accepted.

## Decision

VAOS will use a single source repository while preserving independent application, worker, agent, compute, and integration deployment boundaries.

## Rationale

- Shared contracts stay synchronized.
- Governance and security rules remain consistent.
- Cross-domain changes are traceable.
- CI can qualify interfaces centrally.
- Individual runtimes can scale or deploy independently.

## Consequences

- Boundaries must be enforced by package contracts.
- No domain may reach directly into another domain's persistence layer.
- Public interfaces must be versioned through additive evolution rather than ad-hoc forks.
