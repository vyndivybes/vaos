import { AUTHORITY } from '../../packages/contracts/agent.mjs';

export const VAOS_JOB_CATALOG_VERSION = '1.0.0';

export const ORIGINAL_VAOS_AGENT_IDS = Object.freeze([
  'orchestrator',
  'project',
  'vibpe',
  'qa',
  'risk',
  'security',
  'knowledge',
  'release',
]);

const AGENT_SET = new Set(ORIGINAL_VAOS_AGENT_IDS);

export const ORIGINAL_VAOS_QUALIFICATION_FLOOR = Object.freeze({
  orchestrator: 2,
  project: 2,
  vibpe: 3,
  qa: 3,
  risk: 3,
  security: 4,
  knowledge: 2,
  release: 2,
});
const VALID_RISKS = new Set(['low', 'medium', 'high', 'critical']);
const VALID_PRIORITIES = new Set(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']);
const ACTION_PATTERN = /^[A-Z][A-Z0-9_]*(\.[A-Z][A-Z0-9_]*)+$/;

function freezeJob(input) {
  const job = {
    executionMode: 'ANALYSE',
    verifierAgentIds: [],
    humanApprovalRequired: false,
    monitoring: false,
    monitoringIntervalMinutes: null,
    minimumQualificationLevel: ORIGINAL_VAOS_QUALIFICATION_FLOOR[input.ownerAgentId],
    dependsOnActionTypes: [],
    ...input,
  };
  if (job.monitoring && job.monitoringIntervalMinutes == null) job.monitoringIntervalMinutes = 60;
  if (!AGENT_SET.has(job.ownerAgentId)) throw new Error('VAOS_JOB_OWNER_INVALID');
  if (!ACTION_PATTERN.test(job.actionType)) throw new Error('VAOS_JOB_ACTION_INVALID');
  if (!Number.isInteger(job.authority) || job.authority < AUTHORITY.OBSERVE || job.authority > AUTHORITY.AUTONOMOUS_EXECUTION) {
    throw new Error('VAOS_JOB_AUTHORITY_INVALID');
  }
  if (!VALID_RISKS.has(job.risk)) throw new Error('VAOS_JOB_RISK_INVALID');
  if (!Array.isArray(job.verifierAgentIds) || job.verifierAgentIds.some((id) => !AGENT_SET.has(id))) {
    throw new Error('VAOS_JOB_VERIFIER_INVALID');
  }
  if (!Array.isArray(job.kpis) || job.kpis.length === 0) throw new Error('VAOS_JOB_KPI_REQUIRED');
  if (!Number.isFinite(job.slaHours) || job.slaHours <= 0) throw new Error('VAOS_JOB_SLA_INVALID');
  if (!Array.isArray(job.dependsOnActionTypes)) throw new Error('VAOS_JOB_DEPENDENCY_INVALID');
  if (!Number.isInteger(job.minimumQualificationLevel) || job.minimumQualificationLevel < 1 || job.minimumQualificationLevel > 4) {
    throw new Error('VAOS_JOB_QUALIFICATION_INVALID');
  }
  if (job.monitoring && (!Number.isFinite(job.monitoringIntervalMinutes) || job.monitoringIntervalMinutes <= 0)) {
    throw new Error('VAOS_JOB_MONITORING_INTERVAL_INVALID');
  }
  if (
    ['high', 'critical'].includes(job.risk)
    && !job.humanApprovalRequired
    && !job.verifierAgentIds.some((id) => id !== job.ownerAgentId)
  ) {
    throw new Error('VAOS_JOB_MAKER_CHECKER_REQUIRED');
  }
  return Object.freeze({
    ...job,
    verifierAgentIds: Object.freeze([...job.verifierAgentIds]),
    kpis: Object.freeze([...job.kpis]),
    dependsOnActionTypes: Object.freeze([...job.dependsOnActionTypes]),
  });
}

function j(ownerAgentId, actionType, authority, risk, slaHours, {
  executionMode = 'ANALYSE',
  verifierAgentIds = [],
  humanApprovalRequired = false,
  monitoring = false,
  kpis = ['cycle_time', 'verified_completion'],
  dependsOnActionTypes = [],
} = {}) {
  return freezeJob({
    ownerAgentId,
    actionType,
    authority,
    risk,
    slaHours,
    executionMode,
    verifierAgentIds,
    humanApprovalRequired,
    monitoring,
    kpis,
    dependsOnActionTypes,
  });
}

export const VAOS_JOB_CATALOG = Object.freeze({
  orchestrator: Object.freeze([
    j('orchestrator', 'ORCHESTRATOR.INTAKE_MISSION', AUTHORITY.ANALYSE, 'low', 1, { kpis: ['intake_latency', 'routing_accuracy'] }),
    j('orchestrator', 'ORCHESTRATOR.DECOMPOSE_MISSION', AUTHORITY.RECOMMEND, 'medium', 2, { verifierAgentIds: ['project'], kpis: ['planning_cycle_time', 'dependency_completeness'] }),
    j('orchestrator', 'ORCHESTRATOR.ROUTE_WORK', AUTHORITY.PREPARE, 'medium', 1, { verifierAgentIds: ['project'], executionMode: 'PREPARE', kpis: ['routing_latency', 'handoff_acceptance'] }),
    j('orchestrator', 'ORCHESTRATOR.MONITOR_MISSION', AUTHORITY.ANALYSE, 'low', 1, { monitoring: true, kpis: ['mission_visibility', 'stalled_work_detection'] }),
    j('orchestrator', 'ORCHESTRATOR.REPLAN_MISSION', AUTHORITY.RECOMMEND, 'medium', 2, { verifierAgentIds: ['project'], kpis: ['replan_latency', 'recovery_rate'] }),
    j('orchestrator', 'ORCHESTRATOR.ESCALATE_BLOCKER', AUTHORITY.PREPARE, 'high', 1, { verifierAgentIds: ['risk'], executionMode: 'PREPARE', kpis: ['escalation_latency', 'blocker_resolution'] }),
    j('orchestrator', 'ORCHESTRATOR.REQUEST_APPROVAL', AUTHORITY.PREPARE, 'high', 1, { humanApprovalRequired: true, executionMode: 'PREPARE', kpis: ['approval_wait_time', 'approval_completeness'] }),
    j('orchestrator', 'ORCHESTRATOR.CONSOLIDATE_RESULT', AUTHORITY.RECOMMEND, 'medium', 2, { verifierAgentIds: ['knowledge'], kpis: ['result_completeness', 'evidence_coverage'] }),
    j('orchestrator', 'ORCHESTRATOR.CLOSE_MISSION', AUTHORITY.PREPARE, 'high', 1, { verifierAgentIds: ['release', 'knowledge'], humanApprovalRequired: true, executionMode: 'PREPARE', kpis: ['closure_cycle_time', 'closure_reopen_rate'] }),
  ]),
  project: Object.freeze([
    j('project', 'PROJECT.CREATE_WORK_PACKAGE', AUTHORITY.PREPARE, 'medium', 2, { verifierAgentIds: ['orchestrator'], executionMode: 'PREPARE', kpis: ['work_package_quality', 'planning_cycle_time'] }),
    j('project', 'PROJECT.UPDATE_PROGRESS', AUTHORITY.PREPARE, 'low', 1, { executionMode: 'PREPARE', kpis: ['status_freshness', 'update_accuracy'] }),
    j('project', 'PROJECT.TRACK_DEPENDENCY', AUTHORITY.ANALYSE, 'low', 1, { monitoring: true, kpis: ['dependency_coverage', 'dependency_latency'] }),
    j('project', 'PROJECT.DETECT_DELAY', AUTHORITY.ANALYSE, 'medium', 1, { monitoring: true, verifierAgentIds: ['risk'], kpis: ['delay_detection_lead', 'false_alarm_rate'] }),
    j('project', 'PROJECT.FORECAST_COMPLETION', AUTHORITY.RECOMMEND, 'medium', 4, { verifierAgentIds: ['risk'], kpis: ['forecast_error', 'forecast_cycle_time'] }),
    j('project', 'PROJECT.MANAGE_ACTION', AUTHORITY.PREPARE, 'medium', 2, { verifierAgentIds: ['orchestrator'], executionMode: 'PREPARE', kpis: ['action_closure_rate', 'overdue_actions'] }),
    j('project', 'PROJECT.ESCALATE_RISK', AUTHORITY.APPROVED_EXECUTION, 'medium', 1, { verifierAgentIds: ['risk'], executionMode: 'GOVERNED_EXECUTION', kpis: ['risk_escalation_latency', 'verified_execution'] }),
    j('project', 'PROJECT.ESCALATE_BLOCKER', AUTHORITY.PREPARE, 'high', 1, { verifierAgentIds: ['risk'], humanApprovalRequired: true, executionMode: 'PREPARE', kpis: ['blocker_age', 'escalation_quality'] }),
    j('project', 'PROJECT.ASSESS_GATE', AUTHORITY.RECOMMEND, 'medium', 2, { verifierAgentIds: ['release'], kpis: ['gate_readiness_accuracy', 'open_item_detection'] }),
    j('project', 'PROJECT.GENERATE_STATUS', AUTHORITY.RECOMMEND, 'low', 2, { verifierAgentIds: ['knowledge'], kpis: ['report_freshness', 'evidence_coverage'] }),
  ]),
  vibpe: Object.freeze([
    j('vibpe', 'ENGINEERING.ASSESS_REQUIREMENT', AUTHORITY.RECOMMEND, 'medium', 4, { verifierAgentIds: ['qa'], kpis: ['requirement_coverage', 'assessment_cycle_time'] }),
    j('vibpe', 'ENGINEERING.ANALYSE_GEOMETRY', AUTHORITY.RECOMMEND, 'high', 8, { verifierAgentIds: ['qa'], kpis: ['geometry_rule_coverage', 'technical_rework'] }),
    j('vibpe', 'ENGINEERING.ASSESS_MATERIAL', AUTHORITY.RECOMMEND, 'high', 8, { verifierAgentIds: ['qa', 'risk'], kpis: ['material_evidence_coverage', 'assumption_count'] }),
    j('vibpe', 'ENGINEERING.RUN_FEA', AUTHORITY.PREPARE, 'high', 12, { verifierAgentIds: ['qa'], executionMode: 'PREPARE', kpis: ['simulation_completion', 'model_verification'] }),
    j('vibpe', 'ENGINEERING.REVIEW_FEA', AUTHORITY.RECOMMEND, 'high', 6, { verifierAgentIds: ['qa'], kpis: ['fea_issue_detection', 'review_rework'] }),
    j('vibpe', 'ENGINEERING.COMPARE_DESIGNS', AUTHORITY.RECOMMEND, 'medium', 6, { verifierAgentIds: ['risk'], kpis: ['trade_study_coverage', 'decision_traceability'] }),
    j('vibpe', 'ENGINEERING.ASSESS_CHANGE', AUTHORITY.RECOMMEND, 'high', 6, { verifierAgentIds: ['qa', 'risk'], dependsOnActionTypes: ['ENGINEERING.ASSESS_REQUIREMENT'], kpis: ['change_impact_coverage', 'missed_dependency_rate'] }),
    j('vibpe', 'ENGINEERING.CHECK_CONFIGURATION', AUTHORITY.RECOMMEND, 'high', 4, { verifierAgentIds: ['qa', 'knowledge'], kpis: ['configuration_conformance', 'baseline_mismatch_detection'] }),
    j('vibpe', 'ENGINEERING.CREATE_VERIFICATION_PLAN', AUTHORITY.PREPARE, 'high', 6, { verifierAgentIds: ['qa'], executionMode: 'PREPARE', kpis: ['verification_coverage', 'verification_gap_rate'] }),
    j('vibpe', 'ENGINEERING.REVIEW_TEST_RESULT', AUTHORITY.RECOMMEND, 'high', 6, { verifierAgentIds: ['qa'], kpis: ['test_anomaly_detection', 'evidence_quality'] }),
    j('vibpe', 'ENGINEERING.RECOMMEND_BASELINE', AUTHORITY.RECOMMEND, 'critical', 4, { verifierAgentIds: ['qa', 'risk', 'knowledge'], humanApprovalRequired: true, kpis: ['baseline_readiness', 'open_technical_risks'] }),
    j('vibpe', 'ENGINEERING.BASELINE_CHANGE', AUTHORITY.APPROVED_EXECUTION, 'high', 4, { verifierAgentIds: ['qa', 'knowledge'], humanApprovalRequired: true, executionMode: 'GOVERNED_EXECUTION', kpis: ['verified_execution', 'baseline_traceability'] }),
  ]),
  qa: Object.freeze([
    j('qa', 'QA.VERIFY_RESULT', AUTHORITY.RECOMMEND, 'high', 4, { verifierAgentIds: ['knowledge'], dependsOnActionTypes: ['ENGINEERING.ASSESS_CHANGE'], kpis: ['verification_pass_rate', 'defect_escape_rate'] }),
    j('qa', 'QA.OPEN_NONCONFORMANCE', AUTHORITY.PREPARE, 'medium', 2, { verifierAgentIds: ['knowledge'], executionMode: 'PREPARE', kpis: ['ncr_open_latency', 'evidence_completeness'] }),
    j('qa', 'QA.OPEN_CAPA', AUTHORITY.APPROVED_EXECUTION, 'medium', 2, { verifierAgentIds: ['knowledge'], humanApprovalRequired: true, executionMode: 'GOVERNED_EXECUTION', kpis: ['capa_open_latency', 'verified_execution'] }),
    j('qa', 'QA.ANALYSE_ROOT_CAUSE', AUTHORITY.RECOMMEND, 'medium', 8, { verifierAgentIds: ['risk'], kpis: ['root_cause_confidence', 'recurrence_rate'] }),
    j('qa', 'QA.DEFINE_CONTAINMENT', AUTHORITY.PREPARE, 'high', 2, { verifierAgentIds: ['risk'], executionMode: 'PREPARE', kpis: ['containment_latency', 'containment_effectiveness'] }),
    j('qa', 'QA.REVIEW_CORRECTIVE_ACTION', AUTHORITY.RECOMMEND, 'high', 4, { verifierAgentIds: ['risk'], kpis: ['corrective_action_quality', 'repeat_findings'] }),
    j('qa', 'QA.VERIFY_CORRECTIVE_ACTION', AUTHORITY.RECOMMEND, 'high', 8, { verifierAgentIds: ['knowledge'], kpis: ['verification_closure_rate', 'recurrence_rate'] }),
    j('qa', 'QA.AUDIT_PROCESS', AUTHORITY.RECOMMEND, 'medium', 12, { verifierAgentIds: ['knowledge'], monitoring: true, kpis: ['audit_findings', 'audit_cycle_time'] }),
    j('qa', 'QA.AUDIT_EVIDENCE', AUTHORITY.RECOMMEND, 'medium', 6, { verifierAgentIds: ['knowledge'], kpis: ['evidence_gap_rate', 'traceability_coverage'] }),
    j('qa', 'QA.ASSESS_TEST', AUTHORITY.RECOMMEND, 'high', 6, { verifierAgentIds: ['vibpe'], kpis: ['test_acceptance_accuracy', 'anomaly_detection'] }),
    j('qa', 'QA.CLOSE_CAPA', AUTHORITY.PREPARE, 'high', 4, { verifierAgentIds: ['risk', 'knowledge'], humanApprovalRequired: true, executionMode: 'PREPARE', kpis: ['capa_cycle_time', 'closure_reopen_rate'] }),
    j('qa', 'QA.REJECT_CLOSURE', AUTHORITY.RECOMMEND, 'medium', 2, { verifierAgentIds: ['release'], kpis: ['invalid_closure_detection', 'return_for_correction_rate'] }),
  ]),
  risk: Object.freeze([
    j('risk', 'RISK.IDENTIFY', AUTHORITY.ANALYSE, 'low', 2, { monitoring: true, kpis: ['risk_detection_rate', 'risk_detection_lead'] }),
    j('risk', 'RISK.ASSESS', AUTHORITY.RECOMMEND, 'high', 4, { verifierAgentIds: ['knowledge'], kpis: ['assessment_coverage', 'risk_rework'] }),
    j('risk', 'RISK.SCORE', AUTHORITY.RECOMMEND, 'medium', 2, { verifierAgentIds: ['project'], kpis: ['scoring_consistency', 'score_change_rate'] }),
    j('risk', 'RISK.MODEL_SCENARIO', AUTHORITY.RECOMMEND, 'high', 8, { verifierAgentIds: ['vibpe'], kpis: ['scenario_coverage', 'model_assumption_count'] }),
    j('risk', 'RISK.RECOMMEND_MITIGATION', AUTHORITY.RECOMMEND, 'high', 4, { verifierAgentIds: ['project'], kpis: ['mitigation_acceptance', 'residual_risk_reduction'] }),
    j('risk', 'RISK.MONITOR', AUTHORITY.ANALYSE, 'medium', 1, { monitoring: true, verifierAgentIds: ['project'], kpis: ['indicator_freshness', 'emerging_risk_detection'] }),
    j('risk', 'RISK.REASSESS', AUTHORITY.RECOMMEND, 'high', 4, { verifierAgentIds: ['project'], kpis: ['reassessment_latency', 'residual_risk_accuracy'] }),
    j('risk', 'RISK.ACCEPT', AUTHORITY.PREPARE, 'critical', 2, { humanApprovalRequired: true, executionMode: 'PREPARE', kpis: ['approval_traceability', 'accepted_risk_exposure'] }),
    j('risk', 'RISK.ESCALATE', AUTHORITY.PREPARE, 'high', 1, { verifierAgentIds: ['project'], humanApprovalRequired: true, executionMode: 'PREPARE', kpis: ['escalation_latency', 'escalation_resolution'] }),
    j('risk', 'RISK.CLOSE', AUTHORITY.PREPARE, 'high', 4, { verifierAgentIds: ['project', 'knowledge'], humanApprovalRequired: true, executionMode: 'PREPARE', kpis: ['closure_quality', 'risk_reopen_rate'] }),
  ]),
  security: Object.freeze([
    j('security', 'SECURITY.OBSERVE_IDENTITY', AUTHORITY.APPROVED_EXECUTION, 'high', 1, { verifierAgentIds: ['knowledge'], humanApprovalRequired: true, executionMode: 'GOVERNED_EXECUTION', monitoring: true, kpis: ['identity_observation_latency', 'verified_execution'] }),
    j('security', 'SECURITY.AUTHORIZE_IDENTITY', AUTHORITY.PREPARE, 'critical', 1, { humanApprovalRequired: true, executionMode: 'PREPARE', kpis: ['authorization_accuracy', 'privilege_exception_rate'] }),
    j('security', 'SECURITY.ASSESS_ACCESS', AUTHORITY.RECOMMEND, 'high', 2, { verifierAgentIds: ['knowledge'], kpis: ['least_privilege_conformance', 'access_review_latency'] }),
    j('security', 'SECURITY.DETECT_ANOMALY', AUTHORITY.ANALYSE, 'high', 1, { verifierAgentIds: ['risk'], monitoring: true, kpis: ['detection_latency', 'false_positive_rate'] }),
    j('security', 'SECURITY.REVIEW_SECRET_USE', AUTHORITY.RECOMMEND, 'critical', 2, { verifierAgentIds: ['risk'], humanApprovalRequired: true, kpis: ['secret_exposure_findings', 'secret_rotation_age'] }),
    j('security', 'SECURITY.REVIEW_PROVIDER', AUTHORITY.RECOMMEND, 'high', 4, { verifierAgentIds: ['risk'], kpis: ['provider_risk_coverage', 'provider_exception_count'] }),
    j('security', 'SECURITY.RESTRICT_ACCESS', AUTHORITY.PREPARE, 'critical', 1, { humanApprovalRequired: true, executionMode: 'PREPARE', kpis: ['restriction_latency', 'verified_execution'] }),
    j('security', 'SECURITY.REVOKE_ACCESS', AUTHORITY.PREPARE, 'critical', 1, { humanApprovalRequired: true, executionMode: 'PREPARE', kpis: ['revocation_latency', 'verified_execution'] }),
    j('security', 'SECURITY.ASSESS_CHANGE', AUTHORITY.RECOMMEND, 'high', 4, { verifierAgentIds: ['risk'], kpis: ['security_change_coverage', 'security_rework'] }),
    j('security', 'SECURITY.INVESTIGATE_EVENT', AUTHORITY.RECOMMEND, 'high', 4, { verifierAgentIds: ['knowledge'], kpis: ['investigation_cycle_time', 'evidence_completeness'] }),
    j('security', 'SECURITY.CLOSE_INCIDENT', AUTHORITY.PREPARE, 'high', 4, { verifierAgentIds: ['risk', 'knowledge'], humanApprovalRequired: true, executionMode: 'PREPARE', kpis: ['incident_cycle_time', 'incident_reopen_rate'] }),
  ]),
  knowledge: Object.freeze([
    j('knowledge', 'KNOWLEDGE.INGEST_SOURCE', AUTHORITY.PREPARE, 'medium', 2, { verifierAgentIds: ['security'], executionMode: 'PREPARE', kpis: ['ingest_latency', 'source_integrity'] }),
    j('knowledge', 'KNOWLEDGE.CLASSIFY_AUTHORITY', AUTHORITY.RECOMMEND, 'high', 2, { verifierAgentIds: ['qa'], kpis: ['authority_classification_accuracy', 'source_dispute_rate'] }),
    j('knowledge', 'DIGITAL_THREAD.CREATE_LINK', AUTHORITY.APPROVED_EXECUTION, 'medium', 2, { verifierAgentIds: ['qa'], humanApprovalRequired: true, executionMode: 'GOVERNED_EXECUTION', kpis: ['trace_link_accuracy', 'verified_execution'] }),
    j('knowledge', 'KNOWLEDGE.RESOLVE_CONFLICT', AUTHORITY.RECOMMEND, 'high', 4, { verifierAgentIds: ['qa'], kpis: ['conflict_resolution_rate', 'human_review_rate'] }),
    j('knowledge', 'KNOWLEDGE.MARK_SUPERSEDED', AUTHORITY.PREPARE, 'high', 2, { verifierAgentIds: ['qa'], humanApprovalRequired: true, executionMode: 'PREPARE', kpis: ['stale_source_retirement', 'supersession_accuracy'] }),
    j('knowledge', 'KNOWLEDGE.BUILD_CONTEXT', AUTHORITY.RECOMMEND, 'low', 1, { kpis: ['context_relevance', 'retrieval_latency'] }),
    j('knowledge', 'KNOWLEDGE.BUILD_EVIDENCE_PACK', AUTHORITY.RECOMMEND, 'medium', 4, { verifierAgentIds: ['qa'], dependsOnActionTypes: ['QA.VERIFY_RESULT', 'RISK.ASSESS'], kpis: ['evidence_coverage', 'evidence_pack_cycle_time'] }),
    j('knowledge', 'KNOWLEDGE.DETECT_GAP', AUTHORITY.ANALYSE, 'medium', 1, { monitoring: true, verifierAgentIds: ['qa'], kpis: ['evidence_gap_detection', 'gap_age'] }),
    j('knowledge', 'KNOWLEDGE.DETECT_STALE_SOURCE', AUTHORITY.ANALYSE, 'medium', 1, { monitoring: true, verifierAgentIds: ['qa'], kpis: ['stale_source_detection', 'stale_source_age'] }),
    j('knowledge', 'KNOWLEDGE.RECONSTRUCT_DECISION', AUTHORITY.RECOMMEND, 'medium', 4, { verifierAgentIds: ['qa'], kpis: ['decision_trace_coverage', 'reconstruction_cycle_time'] }),
  ]),
  release: Object.freeze([
    j('release', 'RELEASE.ASSESS_GATE', AUTHORITY.RECOMMEND, 'high', 2, { verifierAgentIds: ['knowledge'], executionMode: 'PREPARE', dependsOnActionTypes: ['QA.VERIFY_RESULT', 'RISK.ASSESS', 'KNOWLEDGE.BUILD_EVIDENCE_PACK'], kpis: ['gate_assessment_accuracy', 'open_item_detection'] }),
    j('release', 'RELEASE.CHECK_EVIDENCE', AUTHORITY.RECOMMEND, 'medium', 2, { verifierAgentIds: ['knowledge'], executionMode: 'PREPARE', kpis: ['evidence_completeness', 'missing_evidence_detection'] }),
    j('release', 'RELEASE.CHECK_OPEN_ITEMS', AUTHORITY.RECOMMEND, 'medium', 1, { verifierAgentIds: ['project'], executionMode: 'PREPARE', kpis: ['open_item_detection', 'stale_item_detection'] }),
    j('release', 'RELEASE.CHECK_RISK', AUTHORITY.RECOMMEND, 'high', 1, { verifierAgentIds: ['risk'], executionMode: 'PREPARE', kpis: ['risk_gate_coverage', 'unresolved_risk_detection'] }),
    j('release', 'RELEASE.CHECK_QUALITY', AUTHORITY.RECOMMEND, 'high', 1, { verifierAgentIds: ['qa'], executionMode: 'PREPARE', kpis: ['quality_gate_coverage', 'open_capa_detection'] }),
    j('release', 'RELEASE.CHECK_CONFIGURATION', AUTHORITY.RECOMMEND, 'high', 1, { verifierAgentIds: ['vibpe'], executionMode: 'PREPARE', kpis: ['configuration_gate_coverage', 'baseline_mismatch_detection'] }),
    j('release', 'RELEASE.PREPARE_RECOMMENDATION', AUTHORITY.RECOMMEND, 'high', 2, { verifierAgentIds: ['knowledge'], humanApprovalRequired: true, executionMode: 'PREPARE', kpis: ['recommendation_completeness', 'condition_clarity'] }),
    j('release', 'RELEASE.DEFINE_CONDITIONS', AUTHORITY.RECOMMEND, 'high', 2, { verifierAgentIds: ['qa', 'risk'], executionMode: 'PREPARE', kpis: ['condition_traceability', 'condition_closure_rate'] }),
    j('release', 'RELEASE.REASSESS', AUTHORITY.RECOMMEND, 'high', 2, { verifierAgentIds: ['knowledge'], executionMode: 'PREPARE', monitoring: true, kpis: ['reassessment_latency', 'gate_state_accuracy'] }),
    j('release', 'RELEASE.OBSERVE_GATE', AUTHORITY.RECOMMEND, 'low', 1, { executionMode: 'PREPARE', monitoring: true, kpis: ['gate_observation_latency', 'recommendation_freshness'] }),
  ]),
});

const JOB_BY_ACTION = new Map(
  Object.values(VAOS_JOB_CATALOG)
    .flat()
    .map((job) => [job.actionType, job]),
);

if (JOB_BY_ACTION.size !== Object.values(VAOS_JOB_CATALOG).flat().length) {
  throw new Error('VAOS_JOB_ACTION_DUPLICATE');
}

export function routeJob(actionType) {
  const job = JOB_BY_ACTION.get(actionType);
  if (!job) throw new Error('VAOS_JOB_NOT_FOUND');
  return {
    catalogVersion: VAOS_JOB_CATALOG_VERSION,
    actionType: job.actionType,
    ownerAgentId: job.ownerAgentId,
    verifierAgentIds: [...job.verifierAgentIds],
    authority: job.authority,
    risk: job.risk,
    executionMode: job.executionMode,
    humanApprovalRequired: job.humanApprovalRequired,
    monitoring: job.monitoring,
    monitoringIntervalMinutes: job.monitoringIntervalMinutes,
    minimumQualificationLevel: job.minimumQualificationLevel,
    slaHours: job.slaHours,
    kpis: [...job.kpis],
  };
}

export const HANDOFF_OUTCOME = Object.freeze({
  ACCEPT: 'ACCEPT',
  REQUEST_INFORMATION: 'REQUEST_INFORMATION',
  REJECT_INVALID: 'REJECT_INVALID',
  RETURN_FOR_CORRECTION: 'RETURN_FOR_CORRECTION',
  ESCALATE: 'ESCALATE',
  COMPLETE: 'COMPLETE', // Legacy transition deliberately unsupported
  SUBMIT: 'SUBMIT',
  VERIFY: 'VERIFY',
  REJECT_VERIFICATION: 'REJECT_VERIFICATION',
  RESUBMIT: 'RESUBMIT',
  RESOLVE_ESCALATION: 'RESOLVE_ESCALATION',
});

const HANDOFF_TRANSITIONS = Object.freeze({
  PENDING: Object.freeze({
    [HANDOFF_OUTCOME.ACCEPT]: 'ACCEPTED',
    [HANDOFF_OUTCOME.REQUEST_INFORMATION]: 'INFORMATION_REQUIRED',
    [HANDOFF_OUTCOME.REJECT_INVALID]: 'REJECTED',
  }),
  ACCEPTED: Object.freeze({
    [HANDOFF_OUTCOME.SUBMIT]: 'SUBMITTED',
    [HANDOFF_OUTCOME.REQUEST_INFORMATION]: 'INFORMATION_REQUIRED',
    [HANDOFF_OUTCOME.RETURN_FOR_CORRECTION]: 'RETURNED',
    [HANDOFF_OUTCOME.ESCALATE]: 'ESCALATED',
  }),
  SUBMITTED: Object.freeze({
    [HANDOFF_OUTCOME.VERIFY]: 'COMPLETED',
    [HANDOFF_OUTCOME.REJECT_VERIFICATION]: 'RETURNED',
  }),
  INFORMATION_REQUIRED: Object.freeze({
    [HANDOFF_OUTCOME.RESUBMIT]: 'PENDING',
  }),
  RETURNED: Object.freeze({
    [HANDOFF_OUTCOME.RESUBMIT]: 'PENDING',
  }),
  ESCALATED: Object.freeze({
    [HANDOFF_OUTCOME.RESOLVE_ESCALATION]: 'ACCEPTED',
  }),
  COMPLETED: Object.freeze({}),
  REJECTED: Object.freeze({}),
});

function requiredText(value, code) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(code);
  return value.trim();
}

function uniqueStrings(values = []) {
  if (!Array.isArray(values)) throw new Error('HANDOFF_EVIDENCE_INVALID');
  return [...new Set(values.map((value) => requiredText(value, 'HANDOFF_EVIDENCE_INVALID')))];
}

function handoffActorAllowed(handoff, outcome, byAgentId) {
  if (outcome === HANDOFF_OUTCOME.RESUBMIT) {
    const last = handoff.history?.at(-1);
    return byAgentId === (last?.event === HANDOFF_OUTCOME.REJECT_VERIFICATION
      ? handoff.toAgentId
      : handoff.fromAgentId);
  }
  if ([HANDOFF_OUTCOME.VERIFY, HANDOFF_OUTCOME.REJECT_VERIFICATION].includes(outcome)) {
    const job = JOB_BY_ACTION.get(handoff.requestedJob);
    const verifierIds = job?.verifierAgentIds?.length
      ? job.verifierAgentIds
      : [handoff.toAgentId === 'orchestrator' ? 'project' : 'orchestrator'];
    return byAgentId !== handoff.toAgentId && verifierIds.includes(byAgentId);
  }
  if ([HANDOFF_OUTCOME.RESOLVE_ESCALATION].includes(outcome)) {
    return byAgentId === 'orchestrator' || byAgentId === handoff.fromAgentId;
  }
  return byAgentId === handoff.toAgentId;
}

export function createGovernedHandoff(input = {}) {
  const id = requiredText(input.id, 'HANDOFF_ID_REQUIRED');
  const missionId = requiredText(input.missionId, 'HANDOFF_MISSION_REQUIRED');
  const workPackageId = requiredText(input.workPackageId, 'HANDOFF_WORK_PACKAGE_REQUIRED');
  const fromAgentId = requiredText(input.fromAgentId, 'HANDOFF_FROM_AGENT_REQUIRED');
  const toAgentId = requiredText(input.toAgentId, 'HANDOFF_TO_AGENT_REQUIRED');
  const requestedJob = requiredText(input.requestedJob, 'HANDOFF_JOB_REQUIRED');
  const reason = requiredText(input.reason, 'HANDOFF_REASON_REQUIRED');
  const requiredOutcome = requiredText(input.requiredOutcome, 'HANDOFF_REQUIRED_OUTCOME_REQUIRED');

  if (!AGENT_SET.has(fromAgentId) || !AGENT_SET.has(toAgentId) || fromAgentId === toAgentId) {
    throw new Error('HANDOFF_AGENT_INVALID');
  }
  if (!JOB_BY_ACTION.has(requestedJob)) throw new Error('HANDOFF_JOB_UNKNOWN');
  if (JOB_BY_ACTION.get(requestedJob).ownerAgentId !== toAgentId) throw new Error('HANDOFF_RECIPIENT_NOT_JOB_OWNER');
  if (!Array.isArray(input.acceptanceCriteria) || input.acceptanceCriteria.length === 0) {
    throw new Error('HANDOFF_ACCEPTANCE_CRITERIA_REQUIRED');
  }
  const acceptanceCriteria = uniqueStrings(input.acceptanceCriteria);
  const evidenceRefs = uniqueStrings(input.evidenceRefs || []);
  const priority = input.priority || 'NORMAL';
  if (!VALID_PRIORITIES.has(priority)) throw new Error('HANDOFF_PRIORITY_INVALID');

  return Object.freeze({
    id,
    missionId,
    workPackageId,
    fromAgentId,
    toAgentId,
    requestedJob,
    reason,
    requiredOutcome,
    acceptanceCriteria: Object.freeze(acceptanceCriteria),
    evidenceRefs: Object.freeze(evidenceRefs),
    priority,
    status: 'PENDING',
    history: Object.freeze([
      Object.freeze({
        event: 'CREATED',
        byAgentId: fromAgentId,
        status: 'PENDING',
      }),
    ]),
  });
}

export function transitionGovernedHandoff(handoff, input = {}) {
  if (!handoff || typeof handoff !== 'object') throw new Error('HANDOFF_REQUIRED');
  const outcome = requiredText(input.outcome, 'HANDOFF_OUTCOME_REQUIRED');
  const byAgentId = requiredText(input.byAgentId, 'HANDOFF_ACTOR_REQUIRED');
  const nextStatus = HANDOFF_TRANSITIONS[handoff.status]?.[outcome];
  if (!nextStatus) throw new Error('HANDOFF_TRANSITION_INVALID');
  if (!handoffActorAllowed(handoff, outcome, byAgentId)) {
    throw new Error(
      [HANDOFF_OUTCOME.VERIFY, HANDOFF_OUTCOME.REJECT_VERIFICATION].includes(outcome)
        ? 'HANDOFF_VERIFIER_NOT_AUTHORIZED'
        : 'HANDOFF_ACTOR_NOT_AUTHORIZED',
    );
  }
  if (outcome === HANDOFF_OUTCOME.SUBMIT && (!Array.isArray(input.evidenceRefs) || input.evidenceRefs.length < 1)) {
    throw new Error('HANDOFF_SUBMISSION_EVIDENCE_REQUIRED');
  }
  if (outcome === HANDOFF_OUTCOME.VERIFY && (!Array.isArray(input.evidenceRefs) || input.evidenceRefs.length < 1)) {
    throw new Error('HANDOFF_VERIFICATION_EVIDENCE_REQUIRED');
  }
  if (outcome === HANDOFF_OUTCOME.REJECT_VERIFICATION && !String(input.reason || '').trim()) {
    throw new Error('HANDOFF_VERIFICATION_REJECTION_REASON_REQUIRED');
  }

  const evidenceRefs = uniqueStrings([...(handoff.evidenceRefs || []), ...(input.evidenceRefs || [])]);
  const event = Object.freeze({
    event: outcome,
    byAgentId,
    status: nextStatus,
    ...(input.reason ? { reason: requiredText(input.reason, 'HANDOFF_REASON_INVALID') } : {}),
    evidenceRefs: Object.freeze(uniqueStrings(input.evidenceRefs || [])),
  });

  return Object.freeze({
    ...handoff,
    status: nextStatus,
    ...(outcome === HANDOFF_OUTCOME.VERIFY ? { verifiedByAgentId: byAgentId } : {}),
    evidenceRefs: Object.freeze(evidenceRefs),
    history: Object.freeze([...(handoff.history || []), event]),
  });
}

function expandDependencies(actionTypes) {
  const seen = new Set();
  const visiting = new Set();
  const ordered = [];

  function visit(actionType) {
    const job = JOB_BY_ACTION.get(actionType);
    if (!job) throw new Error(`VAOS_JOB_NOT_FOUND:${actionType}`);
    if (seen.has(actionType)) return;
    if (visiting.has(actionType)) throw new Error('MISSION_DEPENDENCY_CYCLE');
    visiting.add(actionType);
    for (const dependency of job.dependsOnActionTypes) visit(dependency);
    visiting.delete(actionType);
    seen.add(actionType);
    ordered.push(actionType);
  }

  for (const actionType of actionTypes) visit(actionType);
  return ordered;
}

export function buildMissionPlan(input = {}) {
  const missionId = requiredText(input.missionId, 'MISSION_ID_REQUIRED');
  const objective = requiredText(input.objective, 'MISSION_OBJECTIVE_REQUIRED');
  if (!Array.isArray(input.requestedJobs) || input.requestedJobs.length === 0) {
    throw new Error('MISSION_JOBS_REQUIRED');
  }

  const actionTypes = expandDependencies(uniqueStrings(input.requestedJobs));
  const idByAction = new Map(
    actionTypes.map((actionType, index) => [actionType, `${missionId}-wp-${String(index + 1).padStart(3, '0')}`]),
  );

  const workPackages = actionTypes.map((actionType) => {
    const job = JOB_BY_ACTION.get(actionType);
    return Object.freeze({
      id: idByAction.get(actionType),
      missionId,
      actionType,
      ownerAgentId: job.ownerAgentId,
      verifierAgentIds: Object.freeze([...job.verifierAgentIds]),
      authority: job.authority,
      risk: job.risk,
      executionMode: job.executionMode,
      humanApprovalRequired: job.humanApprovalRequired,
      monitoring: job.monitoring,
      slaHours: job.slaHours,
      kpis: Object.freeze([...job.kpis]),
      dependsOn: Object.freeze(job.dependsOnActionTypes.map((dependency) => idByAction.get(dependency)).filter(Boolean)),
      status: 'PLANNED',
    });
  });

  return Object.freeze({
    id: missionId,
    objective,
    catalogVersion: VAOS_JOB_CATALOG_VERSION,
    status: 'PLANNED',
    createdByAgentId: 'orchestrator',
    workPackages: Object.freeze(workPackages),
  });
}

export function arbitrateAgentFindings(findings = []) {
  if (!Array.isArray(findings)) throw new Error('AGENT_FINDINGS_INVALID');
  const normalized = findings.map((finding) => ({
    agentId: requiredText(finding?.agentId, 'AGENT_FINDING_AGENT_REQUIRED'),
    disposition: requiredText(finding?.disposition, 'AGENT_FINDING_DISPOSITION_REQUIRED').toUpperCase(),
    reason: finding?.reason || null,
  }));
  for (const finding of normalized) {
    if (!AGENT_SET.has(finding.agentId)) throw new Error('AGENT_FINDING_AGENT_INVALID');
  }

  const has = (agentId, dispositions) => normalized.some(
    (finding) => finding.agentId === agentId && dispositions.includes(finding.disposition),
  );

  if (has('security', ['DENY', 'RESTRICT', 'INCIDENT'])) return { decision: 'HOLD_SECURITY', findings: normalized };
  if (has('qa', ['REJECT', 'NONCONFORMING', 'CAPA_OPEN'])) return { decision: 'RETURN_FOR_CORRECTION', findings: normalized };
  if (has('risk', ['ESCALATE', 'INTOLERABLE', 'UNACCEPTABLE'])) return { decision: 'HOLD_RISK', findings: normalized };
  if (has('knowledge', ['EVIDENCE_GAP', 'SOURCE_CONFLICT', 'STALE_SOURCE'])) return { decision: 'REQUEST_INFORMATION', findings: normalized };
  if (has('release', ['HOLD', 'NOT_READY'])) return { decision: 'HOLD_RELEASE', findings: normalized };

  const negative = normalized.filter((finding) => ['DENY', 'REJECT', 'HOLD', 'NOT_READY', 'ESCALATE'].includes(finding.disposition));
  const positive = normalized.filter((finding) => ['READY', 'PASS', 'ACCEPT'].includes(finding.disposition));
  if (negative.length > 0 && positive.length > 0) return { decision: 'HUMAN_REVIEW', findings: normalized };
  return { decision: 'PROCEED', findings: normalized };
}

const PRIORITY_WEIGHT = Object.freeze({
  LOW: 1,
  NORMAL: 2,
  HIGH: 3,
  CRITICAL: 4,
});

function timestamp(value, code) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error(code);
  return time;
}

export function rankWorkQueue(items = [], { now = new Date().toISOString() } = {}) {
  if (!Array.isArray(items)) throw new Error('WORK_QUEUE_INVALID');
  const nowMs = timestamp(now, 'WORK_QUEUE_NOW_INVALID');
  return items
    .map((item) => {
      const priority = item?.priority || 'NORMAL';
      if (!VALID_PRIORITIES.has(priority)) throw new Error('WORK_QUEUE_PRIORITY_INVALID');
      const dueMs = timestamp(item?.dueAt, 'WORK_QUEUE_DUE_AT_INVALID');
      return { ...item, priority, __dueMs: dueMs, __overdue: dueMs < nowMs };
    })
    .sort((a, b) => {
      if (a.__overdue !== b.__overdue) return a.__overdue ? -1 : 1;
      if (PRIORITY_WEIGHT[a.priority] !== PRIORITY_WEIGHT[b.priority]) {
        return PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
      }
      if (a.__dueMs !== b.__dueMs) return a.__dueMs - b.__dueMs;
      return String(a.id || '').localeCompare(String(b.id || ''));
    })
    .map(({ __dueMs, __overdue, ...item }) => item);
}

export function evaluateWorkSla({ startedAt, dueAt, now = new Date().toISOString() } = {}) {
  const startMs = timestamp(startedAt, 'SLA_STARTED_AT_INVALID');
  const dueMs = timestamp(dueAt, 'SLA_DUE_AT_INVALID');
  const nowMs = timestamp(now, 'SLA_NOW_INVALID');
  if (dueMs <= startMs) throw new Error('SLA_WINDOW_INVALID');

  const elapsedRatio = Math.max(0, (nowMs - startMs) / (dueMs - startMs));
  if (nowMs > dueMs) {
    return { state: 'BREACHED', elapsedRatio, remainingMs: dueMs - nowMs };
  }
  if (elapsedRatio >= 0.75) {
    return { state: 'AT_RISK', elapsedRatio, remainingMs: dueMs - nowMs };
  }
  return { state: 'HEALTHY', elapsedRatio, remainingMs: dueMs - nowMs };
}

export function summarizeAgentPerformance(records = []) {
  if (!Array.isArray(records)) throw new Error('PERFORMANCE_RECORDS_INVALID');
  const total = records.length;
  const completed = records.filter((record) => record.status === 'COMPLETED').length;
  const verified = records.filter((record) => record.verification === 'PASS').length;
  const reworked = records.filter((record) => Number(record.reworkCount || 0) > 0).length;
  const slaBreached = records.filter((record) => record.slaState === 'BREACHED').length;
  const atRisk = records.filter((record) => record.slaState === 'AT_RISK').length;
  return {
    total,
    completed,
    verified,
    reworked,
    slaBreached,
    atRisk,
    completionRate: total ? completed / total : 0,
    verificationRate: total ? verified / total : 0,
    reworkRate: total ? reworked / total : 0,
    slaBreachRate: total ? slaBreached / total : 0,
  };
}

export function evaluateAgentRequalification(input = {}) {
  const qualificationLevel = Number(input.qualificationLevel);
  const requiredQualificationLevel = Number(input.requiredQualificationLevel);
  const verificationFailureRate = Number(input.verificationFailureRate || 0);
  const criticalIncidents = Number(input.criticalIncidents || 0);
  const maximumQualificationAgeDays = Number(input.maximumQualificationAgeDays || 365);
  const qualifiedAtMs = timestamp(input.qualifiedAt, 'REQUALIFICATION_QUALIFIED_AT_INVALID');
  const nowMs = timestamp(input.now || new Date().toISOString(), 'REQUALIFICATION_NOW_INVALID');
  const qualificationAgeDays = Math.max(0, (nowMs - qualifiedAtMs) / 86_400_000);
  const reasons = [];

  if (!Number.isInteger(qualificationLevel) || !Number.isInteger(requiredQualificationLevel)) {
    throw new Error('REQUALIFICATION_LEVEL_INVALID');
  }
  if (qualificationLevel < requiredQualificationLevel) reasons.push('QUALIFICATION_LEVEL_INSUFFICIENT');
  if (qualificationAgeDays > maximumQualificationAgeDays) reasons.push('QUALIFICATION_STALE');
  if (input.jobCatalogVersion !== input.qualifiedJobCatalogVersion) reasons.push('JOB_CATALOG_CHANGED');
  if (verificationFailureRate >= 0.1) reasons.push('VERIFICATION_FAILURE_RATE_HIGH');
  if (criticalIncidents > 0) reasons.push('CRITICAL_INCIDENT_RECORDED');

  return {
    required: reasons.length > 0,
    reasons,
    qualificationAgeDays,
    recommendedState: reasons.length > 0 ? 'RETRAINING' : 'ACTIVE',
  };
}


export function selectReadyWorkPackages({ workPackages = [], handoffs = [] } = {}) {
  if (!Array.isArray(workPackages) || !Array.isArray(handoffs)) {
    throw new Error('MISSION_DISPATCH_INPUT_INVALID');
  }
  const byId = new Map(workPackages.map((item) => [item.id, item]));
  const openHandoffStates = new Set([
    'PENDING',
    'ACCEPTED',
    'INFORMATION_REQUIRED',
    'RETURNED',
    'ESCALATED',
  ]);
  const openWorkPackages = new Set(
    handoffs
      .filter((handoff) => openHandoffStates.has(handoff.status))
      .map((handoff) => handoff.workPackageId),
  );

  return workPackages.filter((item) => {
    if (!['PLANNED', 'READY'].includes(item.status)) return false;
    if (openWorkPackages.has(item.id)) return false;
    const dependencies = Array.isArray(item.dependsOn) ? item.dependsOn : [];
    return dependencies.every((dependencyId) => byId.get(dependencyId)?.status === 'COMPLETED');
  });
}

export function dueMonitoringJobs({ now = new Date().toISOString(), lastRuns = {} } = {}) {
  const nowMs = timestamp(now, 'MONITORING_NOW_INVALID');
  if (!lastRuns || typeof lastRuns !== 'object' || Array.isArray(lastRuns)) {
    throw new Error('MONITORING_LAST_RUNS_INVALID');
  }

  return Object.values(VAOS_JOB_CATALOG)
    .flat()
    .filter((job) => job.monitoring)
    .filter((job) => {
      const lastRun = lastRuns[job.actionType];
      if (!lastRun) return true;
      const lastRunMs = timestamp(lastRun, 'MONITORING_LAST_RUN_INVALID');
      return nowMs - lastRunMs >= job.monitoringIntervalMinutes * 60_000;
    });
}

export function assessOperatingModelQualification(workforce = []) {
  if (!Array.isArray(workforce)) throw new Error('OPERATING_QUALIFICATION_WORKFORCE_INVALID');
  const byId = new Map(workforce.map((employee) => [employee.id, employee]));
  const gaps = [];
  let qualifiedJobs = 0;

  for (const agentId of ORIGINAL_VAOS_AGENT_IDS) {
    const employee = byId.get(agentId);
    const requiredLevel = ORIGINAL_VAOS_QUALIFICATION_FLOOR[agentId];
    const actualLevel = Number(employee?.qualificationLevel || 0);
    const active = employee?.status === 'ACTIVE';
    const qualified = active && actualLevel >= requiredLevel;

    if (!qualified) {
      gaps.push({
        agentId,
        requiredLevel,
        actualLevel,
        status: employee?.status || 'MISSING',
      });
      continue;
    }

    const jobs = VAOS_JOB_CATALOG[agentId];
    qualifiedJobs += jobs.filter((job) => job.minimumQualificationLevel <= actualLevel).length;
  }

  const totalJobs = Object.values(VAOS_JOB_CATALOG).flat().length;
  return {
    qualified: gaps.length === 0 && qualifiedJobs === totalJobs,
    qualifiedAgents: ORIGINAL_VAOS_AGENT_IDS.length - gaps.length,
    qualifiedJobs,
    totalJobs,
    gaps,
    catalogVersion: VAOS_JOB_CATALOG_VERSION,
  };
}
