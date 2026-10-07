-- Digital Employee snapshot contract v3.
-- Restores responsibility-contract and capability metadata required by qualification-mode governance.

create or replace function vaos_private.digital_employee_snapshot(p_employee_id text)
returns jsonb
language sql
stable
set search_path = vaos_private, public, pg_temp
as $$
  select jsonb_build_object(
    'id',e.id,
    'name',e.name,
    'role',e.role,
    'department',e.department,
    'mission',e.mission,
    'responsibilities',e.responsibilities,
    'responsibilityContractId',e.responsibility_contract_id,
    'status',e.status,
    'qualificationLevel',e.qualification_level,
    'qualificationRecord',e.qualification_record,
    'evidenceRefs',e.evidence_refs,
    'skills',e.skills,
    'tools',e.tools,
    'kpis',e.kpis,
    'escalationPaths',e.escalation_paths,
    'capabilities',e.capabilities,
    'owner',e.owner,
    'supervisor',e.supervisor,
    'autonomyLevel',e.autonomy_level,
    'modelRequirements',e.model_requirements,
    'costBudget',e.cost_budget,
    'sla',e.sla,
    'memoryPolicy',e.memory_policy,
    'contextPolicy',e.context_policy,
    'currentAssignment',e.current_assignment,
    'priority',e.priority,
    'confidence',e.confidence,
    'heartbeatAt',e.heartbeat_at,
    'version',e.version,
    'createdAt',e.created_at,
    'updatedAt',e.updated_at
  )
  from vaos_private.digital_employees e
  where e.id=p_employee_id
$$;

revoke all on function vaos_private.digital_employee_snapshot(text)
from public, anon, authenticated, service_role;
