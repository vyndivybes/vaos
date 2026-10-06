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

const AGENTS = Object.freeze([
  { id: 'orchestrator', name: 'VAOS Orchestrator', domain: 'Enterprise', status: 'active', authority: 5, confidence: 97, task: 'Coordinating event and approval flow' },
  { id: 'vibpe', name: 'VIBPE Engineering', domain: 'Engineering', status: 'active', authority: 4, confidence: 94, task: 'Watching engineering change impact' },
  { id: 'qa', name: 'QA / CAPA Agent', domain: 'Quality', status: 'approval', authority: 4, confidence: 91, task: 'CAPA-024 requires approval' },
  { id: 'risk', name: 'Risk Agent', domain: 'Governance', status: 'active', authority: 3, confidence: 89, task: 'Recalculating supplier exposure' },
  { id: 'release', name: 'Release Agent', domain: 'Delivery', status: 'observe', authority: 2, confidence: 96, task: 'Release gate evidence watch' },
  { id: 'project', name: 'Project Controls', domain: 'Management', status: 'active', authority: 3, confidence: 92, task: 'Tracking milestone variance' },
  { id: 'security', name: 'Security Agent', domain: 'Security', status: 'active', authority: 4, confidence: 98, task: 'Identity and policy monitoring' },
  { id: 'knowledge', name: 'Knowledge Agent', domain: 'Intelligence', status: 'observe', authority: 1, confidence: 93, task: 'Maintaining source authority graph' },
]);

const APPROVALS = Object.freeze([
  { id: 'APR-1042', title: 'Open CAPA-024', owner: 'QA / CAPA Agent', risk: 'medium', authority: 'L4', reason: 'Repeated dimensional non-conformance pattern', age: '12 min' },
  { id: 'APR-1041', title: 'Approve engineering baseline change', owner: 'VIBPE Engineering', risk: 'high', authority: 'L4', reason: 'Impacts released verification evidence', age: '26 min' },
  { id: 'APR-1038', title: 'Escalate supplier schedule risk', owner: 'Risk Agent', risk: 'low', authority: 'L3', reason: 'Forecast exceeds milestone tolerance', age: '1 h' },
]);

const EVENTS = Object.freeze([
  { id: 'EVT-8821', type: 'QA.CAPA_PROPOSED', source: 'QA / CAPA Agent', summary: 'CAPA-024 prepared from recurring NCR pattern', severity: 'warning', time: '2 min ago', timeRank: 100 },
  { id: 'EVT-8820', type: 'ENGINEERING.IMPACT_ANALYSED', source: 'VIBPE Engineering', summary: 'Baseline change touches 4 verification objects', severity: 'info', time: '7 min ago', timeRank: 93 },
  { id: 'EVT-8819', type: 'SECURITY.SESSION_AUTHENTICATED', source: 'Security Agent', summary: 'Authorised VAOS development identity accepted', severity: 'success', time: '11 min ago', timeRank: 89 },
  { id: 'EVT-8818', type: 'PROJECT.MILESTONE_RISK', source: 'Project Controls', summary: 'Prototype validation milestone variance increased', severity: 'warning', time: '19 min ago', timeRank: 81 },
  { id: 'EVT-8817', type: 'GOVERNANCE.POLICY_CHECK', source: 'VAOS Orchestrator', summary: 'High-risk effects remain human-gated', severity: 'success', time: '31 min ago', timeRank: 69 },
]);

const RISKS = Object.freeze([
  { id: 'RSK-018', title: 'Verification evidence lag', score: 72, band: 'high', trend: 'up' },
  { id: 'RSK-013', title: 'Supplier schedule exposure', score: 56, band: 'medium', trend: 'up' },
  { id: 'RSK-009', title: 'Identity / access drift', score: 22, band: 'low', trend: 'flat' },
]);

export function summarizeAgentFleet(agents = AGENTS) {
  return {
    total: agents.length,
    active: agents.filter((agent) => agent.status === 'active').length,
    needsApproval: agents.filter((agent) => agent.status === 'approval').length,
    observing: agents.filter((agent) => agent.status === 'observe').length,
    maxAuthority: Math.max(0, ...agents.map((agent) => Number(agent.authority) || 0)),
  };
}

export function findModule(id) {
  return MODULES.find((module) => module.id === id) || null;
}

export function normaliseWorkspaceView(view) {
  return findModule(String(view || '').trim())?.id || 'command';
}

export function buildWorkspaceModel() {
  const fleet = summarizeAgentFleet(AGENTS);
  return {
    environment: 'Development',
    release: 'VAOS 0.1 / foundation',
    modules: MODULES.map((item) => ({ ...item })),
    agents: AGENTS.map((item) => ({ ...item })),
    approvals: APPROVALS.map((item) => ({ ...item })),
    events: EVENTS.map((item) => ({ ...item })).sort((a, b) => b.timeRank - a.timeRank),
    risks: RISKS.map((item) => ({ ...item })),
    pulse: {
      governance: 'Nominal',
      evidenceCoverage: 86,
      openApprovals: APPROVALS.length,
      agentFleet: fleet,
      decisionLatency: '4.8 min',
    },
  };
}

export { MODULES };
