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

const APPROVAL_TITLES = Object.freeze({
  'QA.OPEN_CAPA': 'Open CAPA',
  'ENGINEERING.BASELINE_CHANGE': 'Approve engineering baseline change',
  'PROJECT.ESCALATE_RISK': 'Escalate project risk',
});

const EVENT_SEVERITY = Object.freeze({
  'GOVERNANCE.APPROVAL_REQUIRED': 'warning',
  'GOVERNANCE.APPROVAL_DECIDED': 'success',
  'GOVERNANCE.ACTION_AUTHORIZED': 'success',
  'GOVERNANCE.ACTION_DENIED': 'warning',
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
  return {
    environment: 'Development',
    release: 'VAOS 0.2 / durable control plane',
    runtimeMode: runtimeSnapshot.mode,
    modules: MODULES.map((item) => ({ ...item })),
    agents, approvals, events, risks: RISKS.map((item) => ({ ...item })),
    pulse: {
      governance: 'Nominal', evidenceCoverage: 86, openApprovals: approvals.length,
      agentFleet: fleet, decisionLatency: runtimeSnapshot.mode === 'DURABLE_POSTGRES' ? 'durable / policy-gated' : 'policy-gated',
    },
  };
}
export { MODULES };
