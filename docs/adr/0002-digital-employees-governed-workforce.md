# ADR 0002: Digital Employees are governed workforce identities

- Status: Accepted
- Date: 2026-10-07

## Context

VAOS already has capability-scoped agent authority, an event bus, policy evaluation, approval queues and controlled execution. Persistent AI workers now need durable organizational identity without turning model sessions into implicit enterprise identities.

## Decision

VAOS will model a Digital Employee as a first-class governed workforce identity.

A Digital Employee has a stable identity, role, department, mission and responsibilities; has a lifecycle independent from a model session; must be qualified before activation; consumes versioned skills and tools; receives capability-specific L0-L5 authority only through governance; may be restricted, retrained, requalified or retired; and emits auditable workforce events for lifecycle transitions.

The initial lifecycle is:

PROPOSED → TRAINING → QUALIFIED → ACTIVE → RESTRICTED → RETRAINING → QUALIFIED → ACTIVE → RETIRED

The initial qualification scale is Q0 experimental, Q1 general, Q2 business, Q3 engineering and Q4 high assurance.

Responsibility contracts and skills are separate versioned contracts so organizational accountability and reusable capability can evolve independently.

## Consequences

Digital workers can be governed as organizational roles rather than opaque model sessions. Model providers remain replaceable. Skills become portable and independently qualifiable. Workforce lifecycle events can feed evidence, telemetry, cost, audit and future workforce consoles.

The trade-off is that qualification, responsibility and authority require separate records and future persistence must preserve lifecycle history.

## Not decided here

This ADR does not yet define model routing, persistent storage, benchmark evidence schemas, outcome decomposition, agent-to-agent messaging, dynamic teams, cost/ROI accounting or physical-machine authority. Those will build on the same contracts.
