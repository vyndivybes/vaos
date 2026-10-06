create index if not exists vaos_execution_effects_intent_idx
  on vaos_private.execution_effects (intent_id);

create index if not exists vaos_execution_evidence_intent_idx
  on vaos_private.execution_evidence (intent_id);

comment on table vaos_private.execution_jobs is
  'VAOS service-role execution queue. RLS intentionally has no client policies.';
comment on table vaos_private.execution_effects is
  'VAOS governed effects ledger. RLS intentionally has no client policies.';
comment on table vaos_private.execution_evidence is
  'VAOS execution verification evidence. RLS intentionally has no client policies.';
