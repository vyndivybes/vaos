import { createClient } from 'npm:@supabase/supabase-js@2'

const url = Deno.env.get('SUPABASE_URL')!
const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}')
const serverApiKey = secretKeys.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const admin = createClient(url, serverApiKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405)

  const serverKey = req.headers.get('x-vaos-server-key') || ''
  let body: any
  try { body = await req.json() } catch { return json({ error: { code: 'INVALID_JSON' } }, 400) }

  const operation = body?.operation
  const payload = body?.payload || {}
  let rpcName = ''
  let args: Record<string, unknown> = {}

  if (operation === 'snapshot') {
    rpcName = 'vaos_control_snapshot'
    args = { p_server_key: serverKey }
  } else if (operation === 'traceLinks') {
    rpcName = 'vaos_trace_links_snapshot'
    args = { p_server_key: serverKey }
  } else if (operation === 'linkDomainRecords') {
    rpcName = 'vaos_link_domain_records'
    args = {
      p_server_key: serverKey,
      p_job_id: payload.jobId,
      p_lease_token: payload.leaseToken,
      p_source_domain: payload.sourceDomain,
      p_source_record_id: payload.sourceRecordId,
      p_relation_type: payload.relationType,
      p_target_domain: payload.targetDomain,
      p_target_record_id: payload.targetRecordId,
      p_created_by: payload.proposedBy,
      p_context: payload.context || {},
    }
  } else if (operation === 'getDomainLink') {
    rpcName = 'vaos_get_domain_link'
    args = {
      p_server_key: serverKey,
      p_job_id: payload.jobId,
      p_source_domain: payload.sourceDomain,
      p_source_record_id: payload.sourceRecordId,
      p_relation_type: payload.relationType,
      p_target_domain: payload.targetDomain,
      p_target_record_id: payload.targetRecordId,
    }
  } else if (operation === 'submitIntent') {
    rpcName = 'vaos_submit_intent'
    args = {
      p_server_key: serverKey,
      p_idempotency_key: payload.idempotencyKey,
      p_request_hash: payload.requestHash,
      p_agent_id: payload.agentId,
      p_action_type: payload.actionType,
      p_risk: payload.risk,
      p_reason: payload.reason,
      p_payload: payload.payload || {},
      p_authority: payload.authority,
      p_result: payload.result,
      p_event_type: payload.eventType,
    }
  } else if (operation === 'decideApproval') {
    rpcName = 'vaos_decide_approval'
    args = {
      p_server_key: serverKey,
      p_approval_id: payload.approvalId,
      p_decision: payload.decision,
      p_decided_by: payload.decidedBy,
    }
  } else if (operation === 'claimExecution') {
    rpcName = 'vaos_claim_execution'
    args = {
      p_server_key: serverKey,
      p_worker_id: payload.workerId,
      p_lease_seconds: payload.leaseSeconds || 120,
    }
  } else if (operation === 'claimQualificationRecovery') {
    rpcName = 'vaos_claim_qualification_recovery'
    args = {
      p_server_key: serverKey,
      p_job_id: payload.jobId,
      p_worker_id: payload.workerId,
      p_lease_seconds: payload.leaseSeconds || 120,
    }
  } else if (operation === 'completeExecution') {
    rpcName = 'vaos_complete_execution'
    args = {
      p_server_key: serverKey,
      p_job_id: payload.jobId,
      p_lease_token: payload.leaseToken,
      p_adapter_id: payload.adapterId,
      p_effect: payload.effect || {},
      p_verification: payload.verification || {},
    }
  } else if (operation === 'failExecution') {
    rpcName = 'vaos_fail_execution'
    args = {
      p_server_key: serverKey,
      p_job_id: payload.jobId,
      p_lease_token: payload.leaseToken,
      p_error: payload.error || {},
    }
  } else if (operation === 'openCapa') {
    rpcName = 'vaos_open_capa'
    args = {
      p_server_key: serverKey,
      p_job_id: payload.jobId,
      p_lease_token: payload.leaseToken,
      p_capa_id: payload.capaId,
    }
  } else if (operation === 'getCapa') {
    rpcName = 'vaos_get_capa'
    args = {
      p_server_key: serverKey,
      p_job_id: payload.jobId,
      p_capa_id: payload.capaId,
    }
  } else if (operation === 'recordBaselineChange') {
    rpcName = 'vaos_record_baseline_change'
    args = {
      p_server_key: serverKey,
      p_job_id: payload.jobId,
      p_lease_token: payload.leaseToken,
      p_baseline: payload.baseline,
    }
  } else if (operation === 'getBaselineChange') {
    rpcName = 'vaos_get_baseline_change'
    args = {
      p_server_key: serverKey,
      p_job_id: payload.jobId,
      p_baseline: payload.baseline,
    }
  } else if (operation === 'escalateRisk') {
    rpcName = 'vaos_escalate_risk'
    args = {
      p_server_key: serverKey,
      p_job_id: payload.jobId,
      p_lease_token: payload.leaseToken,
      p_risk_id: payload.riskId,
    }
  } else if (operation === 'getRiskEscalation') {
    rpcName = 'vaos_get_risk_escalation'
    args = {
      p_server_key: serverKey,
      p_job_id: payload.jobId,
      p_risk_id: payload.riskId,
    }
  } else if (operation === 'linkRiskQualificationTrace') {
    rpcName = 'vaos_link_risk_qualification_trace'
    args = {
      p_server_key: serverKey,
      p_job_id: payload.jobId,
      p_lease_token: payload.leaseToken,
      p_target_domain: payload.targetDomain,
      p_target_resource_id: payload.targetResourceId,
      p_relation_type: payload.relationType,
    }
  } else if (operation === 'getDigitalEmployee') {
    rpcName = 'vaos_get_digital_employee'
    args = {
      p_server_key: serverKey,
      p_employee_id: payload.employeeId,
    }
  } else if (operation === 'transitionDigitalEmployee') {
    rpcName = 'vaos_transition_digital_employee'
    args = {
      p_server_key: serverKey,
      p_job_id: payload.jobId,
      p_lease_token: payload.leaseToken,
      p_employee_id: payload.employeeId,
      p_action_type: payload.actionType,
      p_qualification_level: payload.qualificationLevel ?? null,
      p_evidence_refs: payload.evidenceRefs || [],
    }
  } else if (operation === 'assessDigitalEmployeeQualification') {
    rpcName = 'vaos_assess_digital_employee_qualification'
    args = {
      p_server_key: serverKey,
      p_job_id: payload.jobId,
      p_lease_token: payload.leaseToken,
      p_employee_id: payload.employeeId,
      p_target_level: payload.targetLevel,
      p_profile_id: payload.profileId,
    }
  } else if (operation === 'getQualificationAssessment') {
    rpcName = 'vaos_get_qualification_assessment'
    args = {
      p_server_key: serverKey,
      p_job_id: payload.jobId,
      p_employee_id: payload.employeeId,
    }
  } else {
    return json({ error: { code: 'INVALID_OPERATION' } }, 422)
  }

  const { data, error } = await admin.rpc(rpcName, args)
  if (error) {
    const invalidKey = String(error.message || '').includes('VAOS_SERVER_KEY_INVALID')
    return json({ error: { code: invalidKey ? 'UNAUTHENTICATED' : 'CONTROL_PLANE_FAILURE' } }, invalidKey ? 401 : 500)
  }
  return json(data, 200)
})
