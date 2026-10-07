const MODULES = Object.freeze([
  { id: 'command', label: 'Command Centre', group: 'Operate', glyph: 'CC', description: 'Enterprise pulse, agents, events and decisions.' },
  { id: 'agents', label: 'Agent Control', group: 'Operate', glyph: 'AI', description: 'Agent fleet, authority and execution state.' },
  { id: 'vibpe', label: 'VIBPE', group: 'Engineering', glyph: 'VI', description: 'Engineering intelligence and co-pilot workspace.' },
  { id: 'engineering', label: 'Engineering', group: 'Engineering', glyph: 'EN', description: 'Requirements, configuration, analysis and release.' },
  { id: 'qa-capa', label: 'QA & CAPA', group: 'Engineering', glyph: 'QA', description: 'Non-conformance, CAPA and quality assurance.' },
  { id: 'projects', label: 'Projects', group: 'Management', glyph: 'PJ', description: 'Milestones, resources and execution control.' },
  { id: 'risk', label: 'Risk', group: 'Management', glyph: 'RK', description: 'Operational, engineering and enterprise risk.' },
  { id: 'governance', label: 'Governance', group: 'Control', glyph: 'GV', description: 'Policy, authority, RBAC/ABAC and control gates.' },
  { id: 'digital-thread', label: 'Digital Thread', group: 'Control', glyph: 'DT', description: 'Traceability from requirement through evidence.' },
  { id: 'evidence', label: 'Evidence', group: 'Control', glyph: 'EV', description: 'Auditable records, verification and release evidence.' },
  { id: 'approvals', label: 'Approvals', group: 'Control', glyph: 'AP', description: 'Human decisions required before governed effects.' },
  { id: 'admin', label: 'Admin', group: 'System', glyph: 'AD', description: 'Identity, integrations and platform configuration.' },
]);

const RISKS = Object.freeze([
  { id: 'RSK-018', title: 'Verification evidence lag', score: 72, band: 'high', trend: 'up' },
  { id: 'RSK-013', title: 'Supplier schedule exposure', score: 56, band: 'medium', trend: 'up' },
  { id: 'RSK-009', title: 'Identity / access drift', score: 22, band: 'low', trend: 'flat' },
]);

const DOMAIN_WORKSPACE_CONFIG = Object.freeze({
  'qa-capa': {
    source: 'qaCapa',
    title: 'Durable CAPA Register',
    resourceLabel: 'CAPA',
    copy: 'Persisted quality actions with approval, execution, verification and event traceability.',
  },
  engineering: {
    source: 'engineering',
    title: 'Engineering Baseline Change Register',
    resourceLabel: 'Baseline',
    copy: 'Governed baseline-change history linked to intent, approval, execution and verification evidence.',
  },
  risk: {
    source: 'projectRisk',
    title: 'Project / Risk Escalation Register',
    resourceLabel: 'Risk',
    copy: 'Durable project-risk escalations with complete governance and execution lineage.',
  },
});

const TRACE_DOMAIN_CONFIG = Object.freeze({
  QA_CAPA: { moduleId: 'qa-capa', label: 'QA / CAPA', glyph: 'QA' },
  ENGINEERING_BASELINE: { moduleId: 'engineering', label: 'Engineering', glyph: 'EN' },
  PROJECT_RISK: { moduleId: 'risk', label: 'Project / Risk', glyph: 'RK' },
});

const APPROVAL_TITLES = Object.freeze({
  'QA.OPEN_CAPA': 'Open CAPA',
  'ENGINEERING.BASELINE_CHANGE': 'Approve engineering baseline change',
  'PROJECT.ESCALATE_RISK': 'Escalate project risk',
  'DIGITAL_THREAD.CREATE_LINK': 'Create digital-thread relationship',
  'WORKFORCE.START_TRAINING': 'Start Digital Employee training',
  'WORKFORCE.QUALIFY': 'Qualify Digital Employee',
  'WORKFORCE.ACTIVATE': 'Activate Digital Employee',
  'WORKFORCE.RESTRICT': 'Restrict Digital Employee',
  'WORKFORCE.START_RETRAINING': 'Start Digital Employee retraining',
  'WORKFORCE.RETIRE': 'Retire Digital Employee',
});

const EVENT_SEVERITY = Object.freeze({
  'GOVERNANCE.APPROVAL_REQUIRED': 'warning',
  'GOVERNANCE.APPROVAL_DECIDED': 'success',
  'GOVERNANCE.ACTION_AUTHORIZED': 'success',
  'GOVERNANCE.ACTION_DENIED': 'warning',
  'EXECUTION.QUEUED': 'info',
  'EXECUTION.CLAIMED': 'info',
  'EXECUTION.SUCCEEDED': 'success',
  'EXECUTION.RETRY_SCHEDULED': 'warning',
  'EXECUTION.DEAD_LETTER': 'warning',
  'EVIDENCE.VERIFIED': 'success',
  'QA.CAPA_OPENED': 'success',
  'ENGINEERING.BASELINE_CHANGE_RECORDED': 'success',
  'PROJECT.RISK_ESCALATION_RECORDED': 'success',
  'DIGITAL_THREAD.LINK_CREATED': 'success',
  'WORKFORCE.DIGITAL_EMPLOYEE.TRANSITIONED': 'success',
  'WORKFORCE.QUALIFICATION_ASSESSED': 'success',
  'AGENT.REGISTERED': 'info',
  'AGENT.ACTION_PREPARED': 'info',
});

function maxAuthority(agent) {
  return Math.max(0, ...Object.values(agent.capabilities || {}).map((value) => Number(value) || 0));
}

function mapAgent(agent) {
  return {
    id: agent.id, name: agent.name, domain: agent.domain, status: agent.status || 'observe',
    authority: maxAuthority(agent), confidence: agent.confidence ?? 0, task: agent.task || 'Awaiting work',
    capabilities: Object.entries(agent.capabilities || {}).map(([actionType, authority]) => ({ actionType, authority })),
  };
}

function agentNameMap(agents) { return new Map(agents.map((agent) => [agent.id, agent.name])); }

function mapApproval(approval, names) {
  return {
    id: approval.id,
    title: APPROVAL_TITLES[approval.actionType] || approval.actionType,
    owner: names.get(approval.agentId) || approval.agentId,
    risk: approval.risk || 'medium',
    authority: `L${approval.authority ?? 0}`,
    reason: approval.reason || 'Governed effect requires human decision',
    age: approval.requestedAt ? 'persisted' : 'runtime',
  };
}

function eventSummary(event, names) {
  const payload = event.payload || {};
  switch (event.type) {
    case 'AGENT.REGISTERED': return `${names.get(payload.agentId) || payload.agentId} registered with ${payload.capabilityCount ?? 0} capability contract(s)`;
    case 'GOVERNANCE.APPROVAL_REQUIRED': return `${payload.actionType} is waiting for human approval`;
    case 'GOVERNANCE.APPROVAL_DECIDED': return `${payload.actionType} was ${String(payload.decision || 'decided').toLowerCase()}`;
    case 'GOVERNANCE.ACTION_AUTHORIZED': return `${payload.actionType} passed policy and authority checks`;
    case 'GOVERNANCE.ACTION_DENIED': return `${payload.actionType} was denied: ${payload.reason || 'policy gate'}`;
    case 'EXECUTION.QUEUED': return `${payload.actionType} entered the durable execution queue`;
    case 'EXECUTION.CLAIMED': return `${payload.actionType} was leased to ${payload.workerId || 'execution worker'}`;
    case 'EXECUTION.SUCCEEDED': return `${payload.actionType} executed and persisted effect evidence`;
    case 'EXECUTION.RETRY_SCHEDULED': return `${payload.actionType} failed and is scheduled for retry`;
    case 'EXECUTION.DEAD_LETTER': return `${payload.actionType} moved to dead letter after a terminal failure`;
    case 'EVIDENCE.VERIFIED': return `Execution evidence verified for ${payload.actionType}`;
    case 'QA.CAPA_OPENED': return `CAPA ${payload.capaId || ''} opened in the durable quality register`;
    case 'ENGINEERING.BASELINE_CHANGE_RECORDED': return `Baseline ${payload.baseline || ''} change persisted`;
    case 'PROJECT.RISK_ESCALATION_RECORDED': return `Risk ${payload.riskId || ''} escalation persisted`;
    case 'DIGITAL_THREAD.LINK_CREATED': return `${payload.sourceDomain || 'record'} ${payload.relationType || 'linked'} ${payload.targetDomain || 'record'}`;
    case 'WORKFORCE.DIGITAL_EMPLOYEE.TRANSITIONED': return `${payload.employeeId || 'Digital Employee'} transitioned ${payload.fromStatus || 'UNKNOWN'} → ${payload.toStatus || 'UNKNOWN'}`;
    case 'WORKFORCE.QUALIFICATION_ASSESSED': return `${payload.employeeId || 'Digital Employee'} Q${payload.targetLevel || '?'} assessment ${payload.status || 'UNKNOWN'}`;
    case 'AGENT.ACTION_PREPARED': return `${payload.actionType} was prepared without executing an effect`;
    default: return event.type;
  }
}

function mapEvent(event, names) {
  return {
    id: event.id, type: event.type, source: names.get(event.source) || event.source,
    summary: eventSummary(event, names), severity: EVENT_SEVERITY[event.type] || 'info',
    time: `event #${event.sequence}`, timeRank: Number(event.sequence) || 0,
  };
}

function mapThreadEvent(event = {}) {
  return {
    id: event.id || null,
    sequence: Number(event.sequence) || 0,
    type: event.type || 'UNKNOWN',
    source: event.source || 'unknown',
    occurredAt: event.occurredAt || null,
    payload: event.payload && typeof event.payload === 'object' ? { ...event.payload } : {},
  };
}

function mapDomainRecord(record = {}) {
  return {
    id: record.id,
    resourceId: record.resourceId || '—',
    status: record.status || 'UNKNOWN',
    recordedAt: record.recordedAt || null,
    intent: {
      id: record.intentId || null,
      status: record.intentStatus || 'UNKNOWN',
      risk: record.intentRisk || null,
    },
    approval: {
      id: record.approvalId || null,
      status: record.approvalStatus || 'NOT_REQUIRED',
      decidedBy: record.decidedBy || null,
      decidedAt: record.decidedAt || null,
    },
    execution: {
      id: record.executionJobId || null,
      status: record.executionStatus || 'UNKNOWN',
      attempts: Number(record.attemptCount) || 0,
      maxAttempts: Number(record.maxAttempts) || 0,
      adapterId: record.adapterId || null,
    },
    evidence: {
      count: Number(record.evidenceCount) || 0,
      verifiedAt: record.evidenceVerifiedAt || null,
    },
    latestEvent: {
      type: record.latestEventType || null,
      occurredAt: record.latestEventAt || null,
    },
    thread: {
      effect: record.effect && typeof record.effect === 'object' ? { ...record.effect } : null,
      verification: record.evidenceVerification && typeof record.evidenceVerification === 'object'
        ? { ...record.evidenceVerification }
        : null,
      events: Array.isArray(record.threadEvents)
        ? record.threadEvents.map(mapThreadEvent).sort((a, b) => a.sequence - b.sequence)
        : [],
    },
  };
}

function buildDomainWorkspaces(domains = {}) {
  return Object.fromEntries(Object.entries(DOMAIN_WORKSPACE_CONFIG).map(([moduleId, config]) => {
    const records = Array.isArray(domains?.[config.source]) ? domains[config.source].map(mapDomainRecord) : [];
    return [moduleId, {
      moduleId,
      title: config.title,
      resourceLabel: config.resourceLabel,
      copy: config.copy,
      records,
      summary: {
        total: records.length,
        succeeded: records.filter((item) => item.execution.status === 'SUCCEEDED').length,
        verified: records.filter((item) => item.evidence.count > 0).length,
        retried: records.filter((item) => item.execution.attempts > 1).length,
      },
    }];
  }));
}

function buildTraceGraph(domainWorkspaces, rawLinks = []) {
  const nodes = [];
  const index = new Map();

  for (const [domain, config] of Object.entries(TRACE_DOMAIN_CONFIG)) {
    const records = domainWorkspaces?.[config.moduleId]?.records || [];
    for (const record of records) {
      const id = `${domain}:${record.id}`;
      const node = {
        id,
        domain,
        domainLabel: config.label,
        glyph: config.glyph,
        moduleId: config.moduleId,
        recordId: record.id,
        resourceId: record.resourceId,
        status: record.status,
        executionStatus: record.execution.status,
        evidenceCount: record.evidence.count,
        recordedAt: record.recordedAt,
      };
      nodes.push(node);
      index.set(id, node);
    }
  }

  const edges = (Array.isArray(rawLinks) ? rawLinks : []).flatMap((link) => {
    const sourceNodeId = `${link.sourceDomain}:${link.sourceRecordId}`;
    const targetNodeId = `${link.targetDomain}:${link.targetRecordId}`;
    if (!index.has(sourceNodeId) || !index.has(targetNodeId)) return [];
    return [{
      id: link.id,
      sourceNodeId,
      targetNodeId,
      sourceDomain: link.sourceDomain,
      targetDomain: link.targetDomain,
      relationType: link.relationType,
      createdBy: link.createdBy || 'system',
      createdAt: link.createdAt || null,
      intentId: link.intentId || null,
      executionJobId: link.executionJobId || null,
      governed: Boolean(link.executionJobId),
      context: link.context && typeof link.context === 'object' ? { ...link.context } : {},
    }];
  });

  const connected = new Set(edges.flatMap((edge) => [edge.sourceNodeId, edge.targetNodeId]));
  return {
    nodes,
    edges,
    summary: {
      totalNodes: nodes.length,
      totalLinks: edges.length,
      connectedNodes: nodes.filter((node) => connected.has(node.id)).length,
      orphanNodes: nodes.filter((node) => !connected.has(node.id)).length,
    },
  };
}


function summaryItem(label, value, note = '') {
  return { label, value, note };
}

const WORKFORCE_ACTION_CONFIG = Object.freeze({
  'WORKFORCE.START_TRAINING': { label: 'Start training', risk: 'medium' },
  'WORKFORCE.ASSESS_QUALIFICATION': { label: 'Run Q3 assessment', risk: 'high', assessment: true },
  'WORKFORCE.QUALIFY': { label: 'Qualify', risk: 'high', qualificationEvidence: true },
  'WORKFORCE.ACTIVATE': { label: 'Activate', risk: 'high' },
  'WORKFORCE.RESTRICT': { label: 'Restrict', risk: 'high' },
  'WORKFORCE.START_RETRAINING': { label: 'Start retraining', risk: 'medium' },
  'WORKFORCE.RETIRE': { label: 'Retire', risk: 'high' },
});

const WORKFORCE_TRANSITIONS = Object.freeze({
  PROPOSED: ['WORKFORCE.START_TRAINING','WORKFORCE.RETIRE'],
  TRAINING: ['WORKFORCE.QUALIFY','WORKFORCE.RETIRE'],
  QUALIFIED: ['WORKFORCE.ACTIVATE','WORKFORCE.RETIRE'],
  ACTIVE: ['WORKFORCE.RESTRICT','WORKFORCE.RETIRE'],
  RESTRICTED: ['WORKFORCE.START_RETRAINING','WORKFORCE.RETIRE'],
  RETRAINING: ['WORKFORCE.QUALIFY','WORKFORCE.RETIRE'],
  RETIRED: [],
});

function minimumQualificationLevel(employee) {
  const value = String(employee?.modelRequirements?.minimumQualification || '');
  const match = value.match(/^Q([1-4])(?:_|$)/);
  return match ? Number(match[1]) : Math.max(1, Number(employee?.qualificationLevel) || 1);
}

const QUALIFICATION_PROFILES = Object.freeze({
  vibpe: Object.freeze({ 3: 'VIBPE_Q3_ENGINEERING_BASELINE_GOVERNANCE_V1' }),
  qa: Object.freeze({ 3: 'QA_Q3_CAPA_GOVERNANCE_V1' }),
  risk: Object.freeze({ 3: 'RISK_Q3_ENTERPRISE_RISK_GOVERNANCE_V1' }),
});

function workforceLifecycleActions(employee) {
  const base = WORKFORCE_TRANSITIONS[employee.lifecycleStatus] || [];
  if (['TRAINING','RETRAINING'].includes(employee.lifecycleStatus)) {
    const targetLevel = minimumQualificationLevel(employee);
    const profileId = QUALIFICATION_PROFILES[employee.id]?.[targetLevel] || null;
    const assessment = employee.latestAssessment;
    const passMatches = assessment
      && assessment.status === 'PASS'
      && Number(assessment.targetLevel) === targetLevel
      && (!profileId || assessment.profileId === profileId);

    if (!passMatches) {
      if (profileId) {
        return [
          {
            actionType: 'WORKFORCE.ASSESS_QUALIFICATION',
            ...WORKFORCE_ACTION_CONFIG['WORKFORCE.ASSESS_QUALIFICATION'],
            targetLevel,
            profileId,
          },
          {
            actionType: 'WORKFORCE.RETIRE',
            ...WORKFORCE_ACTION_CONFIG['WORKFORCE.RETIRE'],
          },
        ];
      }
      return [{
        actionType: 'WORKFORCE.RETIRE',
        ...WORKFORCE_ACTION_CONFIG['WORKFORCE.RETIRE'],
      }];
    }

    return [
      {
        actionType: 'WORKFORCE.QUALIFY',
        ...WORKFORCE_ACTION_CONFIG['WORKFORCE.QUALIFY'],
        recommendedQualificationLevel: targetLevel,
        evidenceRefs: [`qualification_assessment:${assessment.id}`],
      },
      {
        actionType: 'WORKFORCE.RETIRE',
        ...WORKFORCE_ACTION_CONFIG['WORKFORCE.RETIRE'],
      },
    ];
  }

  return base.map((actionType) => ({
    actionType,
    ...WORKFORCE_ACTION_CONFIG[actionType],
    recommendedQualificationLevel: actionType === 'WORKFORCE.QUALIFY'
      ? minimumQualificationLevel(employee)
      : null,
  }));
}

function operationalRow({
  id,
  title,
  resourceId = null,
  status,
  subtitle = '',
  detail = '',
  meta = [],
  kind = 'record',
  responsibilities = [],
  contract = null,
  actions = [],
}) {
  return { id, title, resourceId, status, subtitle, detail, meta, kind, responsibilities, contract, actions };
}

function normalizeWorkforce(runtimeSnapshot, agents) {
  const source = runtimeSnapshot.workforce && typeof runtimeSnapshot.workforce === 'object'
    ? runtimeSnapshot.workforce
    : {};
  const rawContracts = Array.isArray(source.responsibilityContracts) ? source.responsibilityContracts : [];
  const rawEmployees = Array.isArray(source.digitalEmployees) ? source.digitalEmployees : [];
  const contractById = new Map(rawContracts.map((contract) => [contract.id, {
    ...contract,
    outcomes: Array.isArray(contract.outcomes) ? [...contract.outcomes] : [],
    autonomousActions: Array.isArray(contract.autonomousActions) ? [...contract.autonomousActions] : [],
    approvalRequiredActions: Array.isArray(contract.approvalRequiredActions) ? [...contract.approvalRequiredActions] : [],
    prohibitedActions: Array.isArray(contract.prohibitedActions) ? [...contract.prohibitedActions] : [],
    escalationConditions: Array.isArray(contract.escalationConditions) ? [...contract.escalationConditions] : [],
    evidenceRequirements: Array.isArray(contract.evidenceRequirements) ? [...contract.evidenceRequirements] : [],
    approvalThresholds: contract.approvalThresholds && typeof contract.approvalThresholds === 'object'
      ? { ...contract.approvalThresholds }
      : {},
  }]));
  const runtimeById = new Map(agents.map((agent) => [agent.id, agent]));

  const digitalEmployees = rawEmployees.map((employee) => {
    const runtime = runtimeById.get(employee.id);
    const contract = contractById.get(employee.responsibilityContractId) || null;
    return {
      id: employee.id,
      name: employee.name || runtime?.name || employee.id,
      role: employee.role || runtime?.domain || 'Unassigned role',
      department: employee.department || runtime?.domain || 'Unassigned',
      mission: employee.mission || 'Mission not yet defined',
      responsibilities: Array.isArray(employee.responsibilities) ? [...employee.responsibilities] : [],
      responsibilityContractId: employee.responsibilityContractId || null,
      qualificationLevel: Number(employee.qualificationLevel) || 0,
      lifecycleStatus: employee.status || 'PROPOSED',
      autonomyLevel: Number(employee.autonomyLevel) || 0,
      owner: employee.owner || 'Unassigned',
      supervisor: employee.supervisor || 'Human governance',
      currentAssignment: employee.currentAssignment || runtime?.task || 'Awaiting work',
      priority: employee.priority || 'NORMAL',
      confidence: Number(employee.confidence ?? runtime?.confidence ?? 0),
      heartbeatAt: employee.heartbeatAt || null,
      runtimeStatus: runtime?.status || 'not-loaded',
      capabilities: Object.entries(employee.capabilities || {}).map(([actionType, authority]) => ({
        actionType,
        authority: Number(authority) || 0,
      })),
      modelRequirements: employee.modelRequirements && typeof employee.modelRequirements === 'object'
        ? { ...employee.modelRequirements }
        : {},
      costBudget: employee.costBudget && typeof employee.costBudget === 'object' ? { ...employee.costBudget } : {},
      sla: employee.sla && typeof employee.sla === 'object' ? { ...employee.sla } : {},
      memoryPolicy: employee.memoryPolicy && typeof employee.memoryPolicy === 'object' ? { ...employee.memoryPolicy } : {},
      contextPolicy: employee.contextPolicy && typeof employee.contextPolicy === 'object' ? { ...employee.contextPolicy } : {},
      evidenceRefs: Array.isArray(employee.evidenceRefs) ? [...employee.evidenceRefs] : [],
      latestAssessment: employee.latestAssessment && typeof employee.latestAssessment === 'object'
        ? {
            ...employee.latestAssessment,
            targetLevel: Number(employee.latestAssessment.targetLevel) || 0,
            criteria: Array.isArray(employee.latestAssessment.criteria) ? [...employee.latestAssessment.criteria] : [],
            results: employee.latestAssessment.results && typeof employee.latestAssessment.results === 'object'
              ? { ...employee.latestAssessment.results }
              : {},
            evidenceRefs: Array.isArray(employee.latestAssessment.evidenceRefs)
              ? [...employee.latestAssessment.evidenceRefs]
              : [],
          }
        : null,
      contract,
    };
  });

  const computedMetrics = {
    totalDigitalEmployees: digitalEmployees.length,
    proposedDigitalEmployees: digitalEmployees.filter((employee) => employee.lifecycleStatus === 'PROPOSED').length,
    qualifiedDigitalEmployees: digitalEmployees.filter((employee) => ['QUALIFIED','ACTIVE'].includes(employee.lifecycleStatus)).length,
    activeDigitalEmployees: digitalEmployees.filter((employee) => employee.lifecycleStatus === 'ACTIVE').length,
    restrictedDigitalEmployees: digitalEmployees.filter((employee) => employee.lifecycleStatus === 'RESTRICTED').length,
    responsibilityContracts: contractById.size,
  };

  return {
    digitalEmployees,
    responsibilityContracts: [...contractById.values()],
    metrics: { ...computedMetrics, ...(source.metrics || {}) },
  };
}

function domainEvidenceRows(domainWorkspaces) {
  return Object.entries(domainWorkspaces).flatMap(([moduleId, workspace]) =>
    workspace.records
      .filter((record) => record.evidence.count > 0)
      .map((record) => operationalRow({
        id: `evidence:${moduleId}:${record.id}`,
        title: record.resourceId,
        status: 'VERIFIED',
        subtitle: workspace.title,
        detail: record.latestEvent.type || 'EVIDENCE.VERIFIED',
        meta: [
          { label: 'Execution', value: record.execution.status },
          { label: 'Adapter', value: record.execution.adapterId || '—' },
          { label: 'Verified', value: record.evidence.verifiedAt || 'persisted' },
        ],
      }))
  );
}

function buildOperationalViews({ agents, approvals, events, domainWorkspaces, runtimeSnapshot, workforce }) {
  const metrics = runtimeSnapshot.metrics || {};
  const executions = Array.isArray(runtimeSnapshot.executions) ? runtimeSnapshot.executions : [];
  const engineering = domainWorkspaces.engineering?.records || [];
  const projectRisk = domainWorkspaces.risk?.records || [];
  const allDomainRecords = Object.values(domainWorkspaces).flatMap((workspace) => workspace.records || []);
  const verifiedObjects = allDomainRecords.reduce((sum, record) => sum + (record.evidence.count > 0 ? 1 : 0), 0);
  const governanceEvents = events.filter((event) => event.type.startsWith('GOVERNANCE.')).slice(0, 20);
  const evidenceEvents = events.filter((event) => event.type === 'EVIDENCE.VERIFIED').slice(0, 20);
  const evidenceRows = domainEvidenceRows(domainWorkspaces);

  const legacyAgentRows = agents.map((agent) => operationalRow({
    id: `agent:${agent.id}`,
    title: agent.name,
    status: agent.status.toUpperCase(),
    subtitle: `${agent.domain} · L${agent.authority} · ${agent.confidence}% confidence`,
    detail: agent.task,
    meta: agent.capabilities.slice(0, 4).map((capability) => ({
      label: capability.actionType,
      value: `L${capability.authority}`,
    })),
  }));

  const workforceRows = workforce.digitalEmployees.map((employee) => operationalRow({
    id: `digital-employee:${employee.id}`,
    title: employee.name,
    resourceId: employee.id,
    status: employee.lifecycleStatus,
    subtitle: `${employee.role} · ${employee.department}`,
    detail: employee.mission,
    kind: 'digital-employee',
    responsibilities: employee.responsibilities,
    actions: workforceLifecycleActions(employee),
    contract: employee.contract ? {
      id: employee.contract.id,
      outcomes: employee.contract.outcomes,
      autonomousActions: employee.contract.autonomousActions,
      approvalRequiredActions: employee.contract.approvalRequiredActions,
      prohibitedActions: employee.contract.prohibitedActions,
      escalationConditions: employee.contract.escalationConditions,
      evidenceRequirements: employee.contract.evidenceRequirements,
    } : null,
    meta: [
      { label: 'Autonomy', value: `L${employee.autonomyLevel}` },
      { label: 'Qualification', value: `Q${employee.qualificationLevel}` },
      { label: 'Runtime', value: employee.runtimeStatus },
      { label: 'Confidence', value: `${employee.confidence}%` },
      { label: 'Priority', value: employee.priority },
      { label: 'Supervisor', value: employee.supervisor },
      { label: 'Assignment', value: employee.currentAssignment },
      { label: 'Heartbeat', value: employee.heartbeatAt || 'not established' },
    ],
  }));

  const agentRows = workforceRows.length ? workforceRows : legacyAgentRows;

  const vibpeAgent = agents.find((agent) => agent.id === 'vibpe');
  const vibpeRows = engineering.length
    ? engineering.map((record) => operationalRow({
        id: `vibpe:${record.id}`,
        title: record.resourceId,
        resourceId: record.resourceId,
        status: record.status,
        subtitle: 'Engineering baseline',
        detail: `${record.intent.status} → ${record.execution.status} → ${record.evidence.count ? 'VERIFIED' : 'NO EVIDENCE'}`,
        meta: [
          { label: 'Approval', value: record.approval.status },
          { label: 'Attempts', value: `${record.execution.attempts}/${record.execution.maxAttempts || '—'}` },
          { label: 'Adapter', value: record.execution.adapterId || '—' },
        ],
      }))
    : (vibpeAgent ? [operationalRow({
        id: 'vibpe:agent',
        title: vibpeAgent.name,
        status: vibpeAgent.status.toUpperCase(),
        subtitle: 'Engineering intelligence agent',
        detail: vibpeAgent.task,
        meta: vibpeAgent.capabilities.map((capability) => ({ label: capability.actionType, value: `L${capability.authority}` })),
      })] : []);

  const projectAgents = agents.filter((agent) => ['project','risk','orchestrator'].includes(agent.id));
  const projectRows = projectRisk.length
    ? projectRisk.map((record) => operationalRow({
        id: `project:${record.id}`,
        title: record.resourceId,
        resourceId: record.resourceId,
        status: record.status,
        subtitle: 'Project / risk escalation',
        detail: `${record.intent.status} → ${record.execution.status}`,
        meta: [
          { label: 'Approval', value: record.approval.status },
          { label: 'Evidence', value: String(record.evidence.count) },
          { label: 'Attempts', value: `${record.execution.attempts}/${record.execution.maxAttempts || '—'}` },
        ],
      }))
    : projectAgents.map((agent) => operationalRow({
        id: `project-agent:${agent.id}`,
        title: agent.name,
        status: agent.status.toUpperCase(),
        subtitle: agent.domain,
        detail: agent.task,
        meta: [{ label: 'Authority', value: `L${agent.authority}` }],
      }));

  const governanceRows = approvals.length
    ? approvals.map((approval) => operationalRow({
        id: `governance:${approval.id}`,
        title: approval.title,
        status: 'PENDING',
        subtitle: `${approval.owner} · ${approval.risk.toUpperCase()} risk`,
        detail: approval.reason,
        meta: [{ label: 'Authority', value: approval.authority }],
      }))
    : governanceEvents.map((event) => operationalRow({
        id: `governance-event:${event.id}`,
        title: event.type,
        status: event.severity.toUpperCase(),
        subtitle: event.source,
        detail: event.summary,
        meta: [{ label: 'Event', value: `#${event.timeRank}` }],
      }));

  const effectiveEvidenceRows = evidenceRows.length ? evidenceRows : (evidenceEvents.length ? evidenceEvents : events.slice(0, 10)).map((event) => operationalRow({
    id: `evidence-event:${event.id}`,
    title: event.type,
    status: event.type === 'EVIDENCE.VERIFIED' ? 'VERIFIED' : 'EVENT',
    subtitle: event.source,
    detail: event.summary,
    meta: [{ label: 'Event', value: `#${event.timeRank}` }],
  }));

  const adminRows = [
    operationalRow({
      id: 'admin:runtime',
      title: 'Runtime authority',
      status: runtimeSnapshot.mode || 'UNKNOWN',
      subtitle: 'Control-plane persistence mode',
      detail: 'Authenticated server-side control plane backed by the current runtime provider.',
      meta: [
        { label: 'Agents', value: String(agents.length) },
        { label: 'Events', value: String(metrics.eventCount ?? events.length) },
      ],
    }),
    operationalRow({
      id: 'admin:execution',
      title: 'Execution queue',
      status: Number(metrics.executionDeadLetter || 0) > 0 ? 'ATTENTION' : 'HEALTHY',
      subtitle: 'Durable execution worker state',
      detail: `${metrics.executionPending ?? 0} pending · ${metrics.executionSucceeded ?? executions.filter((item) => item.status === 'SUCCEEDED').length} succeeded`,
      meta: [
        { label: 'Leased', value: String(metrics.executionLeased ?? executions.filter((item) => item.status === 'LEASED').length) },
        { label: 'Dead letter', value: String(metrics.executionDeadLetter ?? executions.filter((item) => item.status === 'DEAD_LETTER').length) },
      ],
    }),
    operationalRow({
      id: 'admin:governance',
      title: 'Governance ledger',
      status: approvals.length ? 'ACTION REQUIRED' : 'NOMINAL',
      subtitle: 'Human gates and immutable event history',
      detail: `${approvals.length} pending approval(s) · ${metrics.intentCount ?? '—'} durable intent(s)`,
      meta: [
        { label: 'Governance events', value: String(governanceEvents.length) },
        { label: 'Verified objects', value: String(verifiedObjects) },
      ],
    }),
  ];

  return {
    agents: {
      title: workforceRows.length ? 'Digital Workforce Console' : 'Live Agent Fleet',
      copy: workforceRows.length
        ? 'Durable digital employees with lifecycle state, qualification, bounded autonomy and responsibility contracts.'
        : 'Registered enterprise agents with current state, assigned task, confidence, capabilities and authority.',
      summary: workforceRows.length ? [
        summaryItem('Digital employees', workforce.metrics.totalDigitalEmployees, 'durable registry'),
        summaryItem('Proposed / Q0', workforce.metrics.proposedDigitalEmployees, 'requires qualification'),
        summaryItem('Qualified', workforce.metrics.qualifiedDigitalEmployees, 'qualified or active'),
        summaryItem('Contracts', workforce.metrics.responsibilityContracts, 'responsibility boundaries'),
      ] : [
        summaryItem('Registered', agents.length, 'live fleet'),
        summaryItem('Active', agents.filter((agent) => agent.status === 'active').length, 'executing / available'),
        summaryItem('Human-gated', agents.filter((agent) => agent.status === 'approval').length, 'awaiting authority'),
        summaryItem('Max authority', `L${Math.max(0, ...agents.map((agent) => agent.authority))}`, 'bounded autonomy'),
      ],
      rows: agentRows,
    },
    vibpe: {
      title: 'VIBPE Engineering Intelligence',
      copy: 'Live engineering baseline state, governed changes, execution lineage and VIBPE agent authority.',
      summary: [
        summaryItem('Baselines', engineering.length, 'durable records'),
        summaryItem('Verified', engineering.filter((record) => record.evidence.count > 0).length, 'evidence-backed'),
        summaryItem('Pending gates', approvals.filter((approval) => /engineering/i.test(approval.title)).length, 'human decisions'),
        summaryItem('VIBPE authority', vibpeAgent ? `L${vibpeAgent.authority}` : '—', vibpeAgent?.status || 'unregistered'),
      ],
      rows: vibpeRows,
    },
    projects: {
      title: 'Project Execution Control',
      copy: 'Live project/risk execution state derived from persisted escalations, execution jobs and project-control agents.',
      summary: [
        summaryItem('Risk records', projectRisk.length, 'durable project exposure'),
        summaryItem('Verified', projectRisk.filter((record) => record.evidence.count > 0).length, 'evidence-backed'),
        summaryItem('Execution pending', metrics.executionPending ?? 0, 'durable queue'),
        summaryItem('Project agents', projectAgents.length, 'orchestrator / controls / risk'),
      ],
      rows: projectRows,
    },
    governance: {
      title: 'Governance Control Plane',
      copy: 'Live human gates, policy decisions and governance event history—not a static policy description.',
      summary: [
        summaryItem('Pending approvals', approvals.length, 'human gate'),
        summaryItem('Governance events', governanceEvents.length, 'current snapshot'),
        summaryItem('Execution pending', metrics.executionPending ?? 0, 'post-policy queue'),
        summaryItem('Dead letter', metrics.executionDeadLetter ?? 0, 'terminal exceptions'),
      ],
      rows: governanceRows,
    },
    evidence: {
      title: 'Evidence Ledger',
      copy: 'Verified execution evidence and auditable control-plane events linked to durable domain records.',
      summary: [
        summaryItem('Verified objects', verifiedObjects, 'domain evidence'),
        summaryItem('Evidence events', evidenceEvents.length, 'current snapshot'),
        summaryItem('Domain records', allDomainRecords.length, 'traceable objects'),
        summaryItem('Trace links', runtimeSnapshot.digitalThreadLinks?.length ?? 0, 'explicit relationships'),
      ],
      rows: effectiveEvidenceRows,
    },
    admin: {
      title: 'Platform Administration',
      copy: 'Live runtime, execution, governance and fleet health for VAOS platform administration.',
      summary: [
        summaryItem('Runtime', runtimeSnapshot.mode || 'UNKNOWN', 'persistence provider'),
        summaryItem('Agents', agents.length, 'registered fleet'),
        summaryItem('Events', metrics.eventCount ?? events.length, 'ledger size'),
        summaryItem('Intents', metrics.intentCount ?? '—', 'durable control requests'),
      ],
      rows: adminRows,
    },
  };
}

export function summarizeAgentFleet(agents = []) {
  return {
    total: agents.length,
    active: agents.filter((agent) => agent.status === 'active').length,
    needsApproval: agents.filter((agent) => agent.status === 'approval').length,
    observing: agents.filter((agent) => agent.status === 'observe').length,
    maxAuthority: Math.max(0, ...agents.map((agent) => Number(agent.authority) || 0)),
  };
}

export function findModule(id) { return MODULES.find((module) => module.id === id) || null; }
export function normaliseWorkspaceView(view) { return findModule(String(view || '').trim())?.id || 'command'; }

export function buildWorkspaceModel(runtimeSnapshot) {
  if (!runtimeSnapshot || !Array.isArray(runtimeSnapshot.agents) || !Array.isArray(runtimeSnapshot.approvals) || !Array.isArray(runtimeSnapshot.events)) {
    throw new Error('RUNTIME_SNAPSHOT_REQUIRED');
  }

  const agents = runtimeSnapshot.agents.map(mapAgent);
  const names = agentNameMap(agents);
  const approvals = runtimeSnapshot.approvals.filter((item) => item.status === 'PENDING').map((item) => mapApproval(item, names));
  const events = runtimeSnapshot.events.map((item) => mapEvent(item, names)).sort((a,b) => b.timeRank - a.timeRank);
  const fleet = summarizeAgentFleet(agents);
  const domainWorkspaces = buildDomainWorkspaces(runtimeSnapshot.domains);
  const traceGraph = buildTraceGraph(domainWorkspaces, runtimeSnapshot.digitalThreadLinks);
  const workforce = normalizeWorkforce(runtimeSnapshot, agents);
  const operationalViews = buildOperationalViews({
    agents,
    approvals,
    events,
    domainWorkspaces,
    runtimeSnapshot,
    workforce,
  });

  return {
    environment: 'Development',
    release: 'VAOS 0.3 / governed execution',
    runtimeMode: runtimeSnapshot.mode,
    modules: MODULES.map((item) => ({ ...item })),
    agents,
    approvals,
    events,
    risks: RISKS.map((item) => ({ ...item })),
    domainWorkspaces,
    traceGraph,
    workforce,
    operationalViews,
    pulse: {
      governance: 'Nominal',
      evidenceCoverage: 86,
      openApprovals: approvals.length,
      agentFleet: fleet,
      executionQueue: runtimeSnapshot.metrics?.executionPending ?? 0,
      decisionLatency: runtimeSnapshot.mode === 'DURABLE_POSTGRES' ? 'durable / policy-gated' : 'policy-gated',
    },
  };
}

export { MODULES };
