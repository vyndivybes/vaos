# Governed autonomous procurement observation

VAOS enables `PROCUREMENT.OBSERVE_OPEN_POS` as a read-only L5 mission using the existing signed VYNDI source route, mission audit receipts, inventory independent verifier and capability preflight.

The mission must have `executionMode=ANALYSE`, an exact known action type, qualified responsible agent, valid signed source read and persisted verification. It never creates or changes purchase orders or independently certifies source completeness. Existing maker-checker, revocation, failed-source HOLD and kill switches remain intact.

This change removes a duplicated bridge-read allowlist and reuses the authoritative safe mission list plus bridge contract. No scheduler, credential, service, new agent framework or paid dependency added.
