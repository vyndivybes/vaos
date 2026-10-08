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
  } else if (operation === 'linkKnowledgeQualification') {
    rpcName = 'vaos_link_knowledge_qualification'
    args = {
      p_server_key: serverKey,
      p_job_id: payload.jobId,
      p_lease_token: payload.leaseToken,
      p_source_risk_id: payload.sourceRiskId,
      p_target_baseline: payload.targetBaseline,
      p_relation_type: payload.relationType,
    }
  } else if (operation === 'getKnowledgeQualificationLink') {
    rpcName = 'vaos_get_knowledge_qualification_link'
    args = {
      p_server_key: serverKey,
      p_job_id: payload.jobId,
      p_source_risk_id: payload.sourceRiskId,
      p_target_baseline: payload.targetBaseline,
      p_relation_type: payload.relationType,
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
    if (payload.employeeId === 'project'
        && payload.targetLevel === 2
        && payload.profileId === 'PROJECT_Q2_PROJECT_CONTROLS_V1') {
      rpcName = 'vaos_assess_project_q2_qualification'
    } else if (payload.employeeId === 'release'
        && payload.targetLevel === 2
        && payload.profileId === 'RELEASE_Q2_RELEASE_ASSURANCE_V1') {
      rpcName = 'vaos_assess_release_q2_qualification'
    } else if (payload.employeeId === 'knowledge'
        && payload.targetLevel === 2
        && payload.profileId === 'KNOWLEDGE_Q2_TRACEABILITY_GOVERNANCE_V1') {
      rpcName = 'vaos_assess_knowledge_q2_qualification'
    } else {
      rpcName = 'vaos_assess_digital_employee_qualification'
    }
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
  } else if (operation === 'providerStateGet') {
    rpcName = 'vaos_provider_state_get'
    args = { p_server_key: serverKey, p_provider_id: payload.providerId }
  } else if (operation === 'providerStatePut') {
    rpcName = 'vaos_provider_state_put'
    args = { p_server_key: serverKey, p_state: payload.state || {} }
  } else if (operation === 'callbackCreate') {
    rpcName = 'vaos_callback_create'
    args = { p_server_key: serverKey, p_record: payload.record || {} }
  } else if (operation === 'callbackGet') {
    rpcName = 'vaos_callback_get'
    args = { p_server_key: serverKey, p_receipt_ref: payload.receiptRef }
  } else if (operation === 'callbackConsumeOnce') {
    rpcName = 'vaos_callback_consume_once'
    args = {
      p_server_key: serverKey,
      p_receipt_ref: payload.receiptRef,
      p_token_hash: payload.tokenHash,
      p_provider_id: payload.providerId,
      p_execution_job_id: payload.executionJobId,
      p_intent_id: payload.intentId,
      p_action_key: payload.actionKey,
      p_consumed_at: payload.consumedAt,
      p_status: payload.status,
      p_evidence: payload.evidence || {},
    }
  } else if (operation === 'reconciliationEnqueue') {
    rpcName = 'vaos_reconciliation_enqueue'
    args = { p_server_key: serverKey, p_record: payload.record || {} }
  } else if (operation === 'reconciliationClaim') {
    rpcName = 'vaos_reconciliation_claim'
    args = {
      p_server_key: serverKey,
      p_now: payload.now,
      p_include_not_due: payload.includeNotDue || false,
      p_worker_id: payload.workerId || 'reconciler',
      p_lease_seconds: payload.leaseSeconds || 120,
    }
  } else if (operation === 'reconciliationSave') {
    rpcName = 'vaos_reconciliation_save'
    args = {
      p_server_key: serverKey,
      p_reconciliation_id: payload.reconciliationId,
      p_patch: payload.patch || {},
      p_lease_token: payload.leaseToken || null,
    }
  } else if (operation === 'reconciliationGet') {
    rpcName = 'vaos_reconciliation_get'
    args = { p_server_key: serverKey, p_reconciliation_id: payload.reconciliationId }
  } else if (operation === 'reconciliationList') {
    rpcName = 'vaos_reconciliation_list'
    args = { p_server_key: serverKey }
  } else if (operation === 'qualificationEvidenceAppend') {
    rpcName = 'vaos_provider_qualification_evidence_append'
    args = { p_server_key: serverKey, p_record: payload.record || {} }
  } else if (operation === 'qualificationEvidenceList') {
    rpcName = 'vaos_provider_qualification_evidence_list'
    args = {
      p_server_key: serverKey,
      p_provider_id: payload.providerId,
      p_capability: payload.capability,
    }
  } else if (operation === 'claimQualificationRecovery') {
    rpcName = 'vaos_claim_qualification_recovery'
    args = {
      p_server_key: serverKey,
      p_job_id: payload.jobId,
      p_worker_id: payload.workerId,
      p_lease_seconds: payload.leaseSeconds || 120,
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
  } else if (operation === 'observeIdentity') {
    rpcName = 'vaos_observe_identity'
    args = {
      p_server_key: serverKey,
      p_job_id: payload.jobId,
      p_lease_token: payload.leaseToken,
      p_observation_id: payload.observationId,
    }
  } else if (operation === 'getIdentityObservation') {
    rpcName = 'vaos_get_identity_observation'
    args = {
      p_server_key: serverKey,
      p_job_id: payload.jobId,
      p_observation_id: payload.observationId,
    }
  } else if (operation === 'linkSecurityQualificationTrace') {
    rpcName = 'vaos_link_security_qualification_trace'
    args = {
      p_server_key: serverKey,
      p_job_id: payload.jobId,
      p_lease_token: payload.leaseToken,
      p_source_risk_id: payload.sourceRiskId,
      p_target_baseline: payload.targetBaseline,
      p_relation_type: payload.relationType,
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
