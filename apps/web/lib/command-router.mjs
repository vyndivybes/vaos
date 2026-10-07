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
