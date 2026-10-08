const NAVIGATION = Object.freeze([
  { view: 'command', aliases: ['command', 'command centre', 'command center', 'home'] },
  { view: 'agents', aliases: ['agent', 'agents', 'agent control', 'agent fleet'] },
  { view: 'vibpe', aliases: ['vibpe', 'engineering intelligence'] },
  { view: 'engineering', aliases: ['engineering', 'baseline', 'engineering baseline'] },
  { view: 'qa-capa', aliases: ['qa', 'capa', 'qa capa', 'quality'] },
  { view: 'projects', aliases: ['project', 'projects', 'project control'] },
  { view: 'risk', aliases: ['risk', 'risks', 'risk register'] },
  { view: 'governance', aliases: ['governance', 'policy', 'authority'] },
  { view: 'digital-thread', aliases: ['digital thread', 'thread', 'traceability'] },
  { view: 'evidence', aliases: ['evidence', 'evidence ledger'] },
  { view: 'approvals', aliases: ['approval', 'approvals', 'decision inbox'] },
  { view: 'admin', aliases: ['admin', 'administration', 'platform admin'] },
]);

function normalized(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function navigationTarget(query) {
  const lower = query.toLowerCase();
  const stripped = lower
    .replace(/^(open|show|go to|goto|view|navigate to)\s+/, '')
    .trim();

  for (const item of NAVIGATION) {
    if (item.aliases.includes(stripped)) return item.view;
  }
  return null;
}

export function resolveCommand(input) {
  const query = normalized(input);
  if (!query) return { kind: 'unknown', query: '' };

  if (/^(?:process|drain)\s+execution\s+queue$/i.test(query)) {
    return { kind: 'execution', limit: 5, targetView: 'agents' };
  }

  const capa = query.match(/^open\s+capa\s+(.+)$/i);
  if (capa) {
    return {
      kind: 'intent',
      targetView: 'qa-capa',
      agentId: 'qa',
      actionType: 'QA.OPEN_CAPA',
      risk: 'medium',
      payload: { capaId: capa[1].trim() },
    };
  }

  const baseline = query.match(/^(?:change\s+baseline|baseline\s+change)\s+(.+)$/i);
  if (baseline) {
    return {
      kind: 'intent',
      targetView: 'engineering',
      agentId: 'vibpe',
      actionType: 'ENGINEERING.BASELINE_CHANGE',
      risk: 'high',
      payload: { baseline: baseline[1].trim() },
    };
  }

  const securityRecoveryPrefix = 'qualification security recovery ';
  const securityRecoverySeparator = ' link risk ';
  const securityBaselineSeparator = ' baseline ';
  const securityRecoveryLower = query.toLowerCase();
  if (securityRecoveryLower.startsWith(securityRecoveryPrefix) && securityRecoveryLower.includes(securityRecoverySeparator) && securityRecoveryLower.includes(securityBaselineSeparator)) {
    const riskIndex = securityRecoveryLower.indexOf(securityRecoverySeparator);
    const baselineIndex = securityRecoveryLower.indexOf(securityBaselineSeparator, riskIndex + securityRecoverySeparator.length);
    const observationId = query.slice(securityRecoveryPrefix.length, riskIndex).trim();
    const sourceRiskId = query.slice(riskIndex + securityRecoverySeparator.length, baselineIndex).trim();
    const targetBaseline = query.slice(baselineIndex + securityBaselineSeparator.length).trim();
    if (observationId && sourceRiskId && targetBaseline) {
      return {
        kind: 'intent',
        targetView: 'governance',
        agentId: 'security',
        actionType: 'SECURITY.OBSERVE_IDENTITY',
        risk: 'high',
        payload: {
          observationId,
          qualificationMode: true,
          qualificationRecoveryDrill: true,
          qualificationTrace: {
            sourceRiskId,
            targetBaseline,
            relationType: 'RELATED_TO',
          },
        },
      };
    }
  }

  const qualificationSecurity = query.match(/^qualification\s+security\s+(.+)$/i);
  if (qualificationSecurity) {
    return {
      kind: 'intent',
      targetView: 'governance',
      agentId: 'security',
      actionType: 'SECURITY.OBSERVE_IDENTITY',
      risk: 'high',
      payload: { observationId: qualificationSecurity[1].trim(), qualificationMode: true },
    };
  }

  const observeIdentity = query.match(/^observe\s+identity\s+(.+)$/i);
  if (observeIdentity) {
    return {
      kind: 'intent',
      targetView: 'governance',
      agentId: 'security',
      actionType: 'SECURITY.OBSERVE_IDENTITY',
      risk: 'high',
      payload: { observationId: observeIdentity[1].trim() },
    };
  }

  const linkedRecoveryPrefix = 'qualification risk recovery ';
  const linkedRecoverySeparator = ' link baseline ';
  const linkedRecoveryLower = query.toLowerCase();
  if (linkedRecoveryLower.startsWith(linkedRecoveryPrefix) && linkedRecoveryLower.includes(linkedRecoverySeparator)) {
    const separatorIndex = linkedRecoveryLower.indexOf(linkedRecoverySeparator);
    const riskId = query.slice(linkedRecoveryPrefix.length, separatorIndex).trim();
    const baselineId = query.slice(separatorIndex + linkedRecoverySeparator.length).trim();
    if (riskId && baselineId) {
      return {
        kind: 'intent',
        targetView: 'risk',
        agentId: 'risk',
        actionType: 'PROJECT.ESCALATE_RISK',
        risk: 'medium',
        payload: {
          riskId,
          qualificationMode: true,
          qualificationRecoveryDrill: true,
          qualificationTrace: {
            targetDomain: 'ENGINEERING_BASELINE',
            targetResourceId: baselineId,
            relationType: 'MITIGATES_RISK',
          },
        },
      };
    }
  }

  const qualificationRecoveryRisk = query.match(/^qualification\s+risk\s+recovery\s+(.+)$/i);
  if (qualificationRecoveryRisk) {
    return {
      kind: 'intent',
      targetView: 'risk',
      agentId: 'risk',
      actionType: 'PROJECT.ESCALATE_RISK',
      risk: 'medium',
      payload: {
        riskId: qualificationRecoveryRisk[1].trim(),
        qualificationMode: true,
        qualificationRecoveryDrill: true,
      },
    };
  }

  const qualificationRisk = query.match(/^qualification\s+risk\s+(.+)$/i);
  if (qualificationRisk) {
    return {
      kind: 'intent',
      targetView: 'risk',
      agentId: 'risk',
      actionType: 'PROJECT.ESCALATE_RISK',
      risk: 'medium',
      payload: { riskId: qualificationRisk[1].trim(), qualificationMode: true },
    };
  }

  const qualificationReleaseGate = query.match(/^qualification\s+release\s+gate\s+(.+)$/i);
  if (qualificationReleaseGate) {
    return {
      kind: 'intent',
      targetView: 'governance',
      agentId: 'release',
      actionType: 'RELEASE.OBSERVE_GATE',
      risk: 'low',
      payload: { gateId: qualificationReleaseGate[1].trim(), qualificationMode: true },
    };
  }

  const releaseGate = query.match(/^release\s+gate\s+(.+)$/i);
  if (releaseGate) {
    return {
      kind: 'intent',
      targetView: 'governance',
      agentId: 'release',
      actionType: 'RELEASE.OBSERVE_GATE',
      risk: 'low',
      payload: { gateId: releaseGate[1].trim() },
    };
  }

  const qualificationKnowledgeLink = query.match(/^qualification\s+knowledge\s+link\s+risk\s+(\S+)\s+baseline\s+(.+)$/i);
  if (qualificationKnowledgeLink) {
    return {
      kind: 'intent',
      targetView: 'digital-thread',
      agentId: 'knowledge',
      actionType: 'DIGITAL_THREAD.CREATE_LINK',
      risk: 'medium',
      payload: {
        sourceRiskId: qualificationKnowledgeLink[1].trim(),
        targetBaseline: qualificationKnowledgeLink[2].trim(),
        relationType: 'RELATED_TO',
        qualificationKnowledgeLink: true,
        qualificationMode: true,
      },
    };
  }

  const knowledgeLink = query.match(/^knowledge\s+link\s+risk\s+(\S+)\s+baseline\s+(.+)$/i);
  if (knowledgeLink) {
    return {
      kind: 'intent',
      targetView: 'digital-thread',
      agentId: 'knowledge',
      actionType: 'DIGITAL_THREAD.CREATE_LINK',
      risk: 'medium',
      payload: {
        sourceRiskId: knowledgeLink[1].trim(),
        targetBaseline: knowledgeLink[2].trim(),
        relationType: 'RELATED_TO',
        qualificationKnowledgeLink: true,
      },
    };
  }

  const qualificationProjectRisk = query.match(/^qualification\s+project\s+risk\s+(.+)$/i);
  if (qualificationProjectRisk) {
    return {
      kind: 'intent',
      targetView: 'projects',
      agentId: 'project',
      actionType: 'PROJECT.ESCALATE_RISK',
      risk: 'medium',
      payload: { riskId: qualificationProjectRisk[1].trim(), qualificationMode: true },
    };
  }

  const projectRisk = query.match(/^project\s+risk\s+(.+)$/i);
  if (projectRisk) {
    return {
      kind: 'intent',
      targetView: 'projects',
      agentId: 'project',
      actionType: 'PROJECT.ESCALATE_RISK',
      risk: 'medium',
      payload: { riskId: projectRisk[1].trim() },
    };
  }

  const risk = query.match(/^escalate\s+risk\s+(.+)$/i);
  if (risk) {
    return {
      kind: 'intent',
      targetView: 'risk',
      agentId: 'risk',
      actionType: 'PROJECT.ESCALATE_RISK',
      risk: 'medium',
      payload: { riskId: risk[1].trim() },
    };
  }

  const view = navigationTarget(query);
  if (view) return { kind: 'navigate', view };

  return { kind: 'unknown', query };
}

export { NAVIGATION };
