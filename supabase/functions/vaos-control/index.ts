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

  if (operation === 'signVyndiBridgeRequest') {
    const canonical = String(payload.canonical || '')
    const keyId = String(payload.keyId || '')
    if (!canonical || !keyId || canonical.length > 4096) {
      return json({ error: { code: 'INVALID_SIGNING_REQUEST' } }, 422)
    }

    const { data: keyRecord, error: keyError } = await admin.rpc('vaos_get_bridge_signing_key', {
      p_server_key: serverKey,
      p_key_id: keyId,
    })
    if (keyError) {
      const invalidKey = String(keyError.message || '').includes('VAOS_SERVER_KEY_INVALID')
      return json({ error: { code: invalidKey ? 'UNAUTHENTICATED' : 'SIGNING_KEY_UNAVAILABLE' } }, invalidKey ? 401 : 503)
    }

    const privateJwk = keyRecord?.privateJwk
    if (!privateJwk || keyRecord?.algorithm !== 'ECDSA_P256_SHA256') {
      return json({ error: { code: 'SIGNING_KEY_INVALID' } }, 503)
    }

    const key = await crypto.subtle.importKey(
      'jwk',
      privateJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign'],
    )
    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      new TextEncoder().encode(canonical),
    )
    const bytes = new Uint8Array(signature)
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
    return json({ keyId: keyRecord.keyId, signature: encoded }, 200)
  }

  let rpcName = ''
  let args: Record<string, unknown> = {}

  if (operation === 'operationalCommissioningSnapshot') {
    rpcName = 'vaos_operational_commissioning_snapshot'
    args = { p_server_key: serverKey }
  } else if (operation === 'createOperatingMission') {
    rpcName = 'vaos_create_operating_mission'
    args = {
      p_server_key: serverKey,
      p_mission_id: payload.missionId,
      p_objective: payload.objective,
      p_catalog_version: payload.catalogVersion,
      p_created_by_agent_id: payload.createdByAgentId,
      p_work_packages: payload.workPackages || [],
    }
  } else if (operation === 'dispatchOperatingMission') {
    rpcName = 'vaos_dispatch_operating_mission'
    args = {
      p_server_key: serverKey,
      p_mission_id: payload.missionId,
      p_max_assignments: payload.maxAssignments ?? 8,
    }
  } else if (operation === 'createOperatingHandoff') {
    rpcName = 'vaos_create_operating_handoff'
    args = {
      p_server_key: serverKey,
      p_handoff_id: payload.handoffId,
      p_mission_id: payload.missionId,
      p_work_package_id: payload.workPackageId,
      p_from_agent_id: payload.fromAgentId,
      p_to_agent_id: payload.toAgentId,
      p_requested_job: payload.requestedJob,
      p_reason: payload.reason,
      p_required_outcome: payload.requiredOutcome,
      p_acceptance_criteria: payload.acceptanceCriteria || [],
      p_evidence_refs: payload.evidenceRefs || [],
      p_priority: payload.priority || 'NORMAL',
    }
  } else if (operation === 'transitionOperatingHandoff') {
    rpcName = 'vaos_transition_operating_handoff'
    args = {
      p_server_key: serverKey,
      p_handoff_id: payload.handoffId,
      p_expected_version: payload.expectedVersion,
      p_outcome: payload.outcome,
      p_by_agent_id: payload.byAgentId,
      p_reason: payload.reason || null,
      p_evidence_refs: payload.evidenceRefs || [],
    }
  } else if (operation === 'recordOperatingWorkEvidence') {
    rpcName = 'vaos_record_handoff_work_evidence'
    args = {
      p_server_key: serverKey,
      p_handoff_id: payload.handoffId,
      p_expected_version: payload.expectedVersion,
      p_by_agent_id: payload.byAgentId,
      p_report: payload.report,
    }
  } else if (operation === 'getOperatingWorkEvidence') {
    rpcName = 'vaos_get_handoff_work_evidence'
    args = {
      p_server_key: serverKey,
      p_evidence_id: payload.evidenceId,
    }
  } else if (operation === 'listRunnableMissions') {
    rpcName = 'vaos_list_runnable_missions'
    args = {
      p_server_key: serverKey,
      p_limit: payload.limit ?? 8,
    }
  } else if (operation === 'prepareOperatingMissionClosure') {
    rpcName = 'vaos_prepare_operating_mission_closure'
    args = { p_server_key: serverKey, p_mission_id: payload.missionId }
  } else if (operation === 'getApprovedProgramBaseline') {
    rpcName = 'vaos_get_approved_program_baseline'
    args = { p_server_key: serverKey, p_project_id: payload.projectId }
  } else if (operation === 'operatingMissionSnapshot') {
    rpcName = 'vaos_operating_mission_snapshot'
    args = {
      p_server_key: serverKey,
      p_mission_id: payload.missionId,
    }
  } else if (operation === 'snapshot') {
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
  } else if (operation === 'claimProductionObservation') {
    rpcName = 'vaos_claim_production_observation'
    args = { p_server_key: serverKey, p_worker_id: 'vaos-production-l5-cron',
      p_idempotency_key: payload.idempotencyKey, p_lease_seconds: 120 }
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
  } else if (operation === 'infisicalCommissioningControl') {
    // Scoped SQL RPC: health record or emergency disable only. It cannot enable.
    rpcName = 'vaos_infisical_commissioning_control'
    args = {
      p_server_key: serverKey,
      p_action: payload.action,
      p_health: payload.health ?? null,
      p_authority_ref: payload.authorityRef,
    }
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
