# Agent Authority Model

Authority is capability-specific.

| Level | Authority |
|---|---|
| L0 | Observe |
| L1 | Analyse |
| L2 | Recommend |
| L3 | Prepare action |
| L4 | Execute after approval |
| L5 | Autonomous execution within policy |

## Example

```text
QA Agent
Read NCRs         L5
Analyse defect    L5
Draft CAPA        L4
Open CAPA         L4
Close CAPA        L3
Release product   L1
Delete evidence   NEVER
```

## Non-negotiable controls

- No blanket administrator privilege for an agent.
- Sensitive capabilities require scoped credentials.
- Policy can reduce authority dynamically.
- Low confidence or high risk escalates to human approval.
- Every effect records actor, intent, tool, authorization, result, verification, and evidence.
