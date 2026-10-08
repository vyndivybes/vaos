# VYNDI Digital Workforce v1

## Operating boundary

VAOS governs the Digital Workforce. VYNDI remains the canonical business execution and truth plane.

A Digital Employee may observe, analyse, recommend and submit governed intents. State-changing VYNDI effects must travel through VAOS policy/authority, approval where required, the VYNDI governed API, independent verification, and evidence/audit. No Digital Employee receives direct database authority over VYNDI.

## Sixteen-role workforce

The existing active VAOS supervisory/intelligence workforce remains:

1. VAOS Orchestrator
2. VIBPE Engineering
3. QA / CAPA Agent
4. Enterprise Risk Agent
5. Security Agent
6. Release Assurance Agent
7. Project Controls Agent
8. Knowledge Agent

This release adds eight VYNDI operational identities:

| ID | Role | Target qualification | Mutation authority |
| --- | --- | --- | --- |
| commercial | Commercial / Sales Controller | Q2 Business | L4, approval required |
| procurement | Procurement & Supply Chain Controller | Q3 Engineering | L4, approval required |
| inventory | Inventory & Stores Controller | Q3 Engineering | L4, approval required |
| production | Production / MES Controller | Q3 Engineering | L4, approval required |
| maintenance | Maintenance & Reliability Controller | Q3 Engineering | L4, approval required |
| finance | Finance Controller | Q4 High Assurance | L4, approval required |
| people | People & Payroll Controller | Q3 Engineering | L4, approval required |
| engineering-configuration | Engineering Configuration Controller | Q4 High Assurance | L4, approval required |

All eight are introduced as **PROPOSED / Q0**. Source definition does not qualify or activate them.

## Collaboration model

```text
VYNDI event / human mission
        |
        v
VAOS Orchestrator
        |
        +--> relevant Digital Employees
        |       |
        |       +--> analysis / recommendation / governed intent
        |
        +--> Risk / Security / QA / VIBPE when applicable
        |
        v
VAOS policy + responsibility contract + L0-L5 authority
        |
        +--> DENY
        +--> PREPARE_ONLY
        +--> AWAIT_APPROVAL
        +--> ALLOW (safe observation only in this roster)
        |
        v
Automation Fabric capability
        |
        v
VYNDI governed API
        |
        v
canonical transaction + verification + evidence
```

Automation providers are replaceable executors. They do not become employee authority or business truth.

## Segregation of duties

- Procurement cannot issue stock or prepare payment.
- Inventory cannot create purchase orders or prepare payment.
- Production cannot change engineering configuration or prepare payment.
- Finance cannot commit customer orders or issue inventory.
- Engineering Configuration cannot release production jobs or prepare payments.
- People & Payroll cannot prepare finance payments.
- Every role prohibits evidence deletion.
- VIBPE remains engineering intelligence; Engineering Configuration Control owns the governed configuration-control workflow.

## Activation sequence

1. Apply the durable roster migration.
2. Start training through the existing governed workforce lifecycle.
3. Build qualification evidence by role.
4. Assess each role to its target Q-level.
5. Qualify only after PASS evidence.
6. Activate only through the existing approved workforce action.
7. Verify VYNDI collaboration with rollback/recovery and cross-domain trace evidence.

The roster is structurally complete at 16 employees after step 1, but only qualified/active employees may perform runtime actions.
