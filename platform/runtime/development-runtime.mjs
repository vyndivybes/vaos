import { AUTHORITY, createAgentDefinition } from '../../packages/contracts/agent.mjs';
import { createAgentRuntime } from './agent-runtime.mjs';

const AGENT_DEFINITIONS = Object.freeze([
  {
    id: 'orchestrator',
    name: 'VAOS Orchestrator',
    domain: 'Enterprise',
    status: 'active',
    confidence: 97,
    task: 'Coordinating event and approval flow',
    capabilities: {
      'PROJECT.ESCALATE_RISK': AUTHORITY.AUTONOMOUS_EXECUTION,
      'WORKFORCE.START_TRAINING': AUTHORITY.APPROVED_EXECUTION,
      'WORKFORCE.QUALIFY': AUTHORITY.APPROVED_EXECUTION,
      'WORKFORCE.ACTIVATE': AUTHORITY.APPROVED_EXECUTION,
      'WORKFORCE.RESTRICT': AUTHORITY.APPROVED_EXECUTION,
      'WORKFORCE.START_RETRAINING': AUTHORITY.APPROVED_EXECUTION,
      'WORKFORCE.RETIRE': AUTHORITY.APPROVED_EXECUTION,
    },
  },
  {
    id: 'vibpe',
    name: 'VIBPE Engineering',
    domain: 'Engineering',
    status: 'approval',
    confidence: 94,
    task: 'Baseline change waiting at governance gate',
    capabilities: {
      'ENGINEERING.BASELINE_CHANGE': AUTHORITY.AUTONOMOUS_EXECUTION,
    },
  },
  {
    id: 'qa',
    name: 'QA / CAPA Agent',
    domain: 'Quality',
    status: 'approval',
    confidence: 91,
    task: 'CAPA-024 waiting for approval',
    capabilities: {
      'QA.OPEN_CAPA': AUTHORITY.APPROVED_EXECUTION,
    },
  },
  {
    id: 'risk',
    name: 'Risk Agent',
    domain: 'Governance',
    status: 'approval',
    confidence: 89,
    task: 'Supplier exposure escalation waiting for approval',
    capabilities: {
      'PROJECT.ESCALATE_RISK': AUTHORITY.APPROVED_EXECUTION,
    },
  },
  {
    id: 'release',
    name: 'Release Agent',
    domain: 'Delivery',
    status: 'observe',
    confidence: 96,
    task: 'Watching release gate evidence',
    capabilities: {
      'RELEASE.OBSERVE_GATE': AUTHORITY.RECOMMEND,
    },
  },
  {
    id: 'project',
    name: 'Project Controls',
    domain: 'Management',
    status: 'active',
    confidence: 92,
    task: 'Tracking milestone variance',
    capabilities: {
      'PROJECT.ESCALATE_RISK': AUTHORITY.PREPARE,
    },
  },
  {
    id: 'security',
    name: 'Security Agent',
    domain: 'Security',
    status: 'active',
    confidence: 98,
    task: 'Monitoring identity and policy state',
    capabilities: {
      'SECURITY.OBSERVE_IDENTITY': AUTHORITY.APPROVED_EXECUTION,
    },
  },
  {
    id: 'knowledge',
    name: 'Knowledge Agent',
    domain: 'Intelligence',
    status: 'observe',
    confidence: 93,
    task: 'Maintaining source authority and governed digital thread',
    capabilities: {
      'KNOWLEDGE.READ_GRAPH': AUTHORITY.ANALYSE,
      'DIGITAL_THREAD.CREATE_LINK': AUTHORITY.APPROVED_EXECUTION,
    },
  },
]);

function registerFleet(runtime) {
  for (const definition of AGENT_DEFINITIONS) {
    runtime.registerAgent(createAgentDefinition(definition));
  }
}

function seedGovernedIntents(runtime) {
  runtime.proposeIntent({
    idempotencyKey: 'dev:qa:capa:024',
    agentId: 'qa',
    actionType: 'QA.OPEN_CAPA',
    risk: 'medium',
    reason: 'Recurring dimensional non-conformance pattern',
    payload: { capaId: 'CAPA-024' },
  });

  runtime.proposeIntent({
    idempotencyKey: 'dev:engineering:baseline:539',
    agentId: 'vibpe',
    actionType: 'ENGINEERING.BASELINE_CHANGE',
    risk: 'high',
    reason: 'Baseline change impacts released verification evidence',
    payload: { baseline: '5.3.9' },
  });

  runtime.proposeIntent({
    idempotencyKey: 'dev:risk:supplier:013',
    agentId: 'risk',
    actionType: 'PROJECT.ESCALATE_RISK',
    risk: 'medium',
    reason: 'Supplier schedule forecast exceeds milestone tolerance',
    payload: { riskId: 'RSK-013' },
  });

  runtime.proposeIntent({
    idempotencyKey: 'dev:orchestrator:risk:013',
    agentId: 'orchestrator',
    actionType: 'PROJECT.ESCALATE_RISK',
    risk: 'medium',
    reason: 'Orchestrator policy authorization demonstration',
    payload: { riskId: 'RSK-013', mode: 'policy-authorized' },
  });
}

export function createDevelopmentRuntime(options = {}) {
  const runtime = createAgentRuntime(options);
  registerFleet(runtime);
  seedGovernedIntents(runtime);
  return runtime;
}

export { AGENT_DEFINITIONS };
