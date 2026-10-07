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
