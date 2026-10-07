const shell = document.querySelector('#control-shell');
const loading = document.querySelector('#workspace-loading');
const nav = document.querySelector('#module-nav');
const identityEmail = document.querySelector('#identity-email');
const environmentLabel = document.querySelector('#environment-label');
const logout = document.querySelector('#logout-button');
const commandView = document.querySelector('#command-view');
const moduleView = document.querySelector('#module-view');
const moduleTitle = document.querySelector('#module-title');
const moduleGroup = document.querySelector('#module-group');
const moduleDescription = document.querySelector('#module-description');
const dialog = document.querySelector('#command-dialog');
const commandButton = document.querySelector('#command-button');
const commandInput = document.querySelector('#command-input');
const commandResults = document.querySelector('#command-results');

let model = null;
let currentView = 'command';
let traceProposalKey = null;

const esc = (value) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

function moduleGroups(modules) {
  return modules.reduce((groups, module) => {
    (groups[module.group] ||= []).push(module);
    return groups;
  }, {});
}

function renderNavigation() {
  const groups = moduleGroups(model.modules);
  nav.innerHTML = Object.entries(groups).map(([group, modules]) => `
    <div class="nav-group"><span class="nav-group__label">${esc(group)}</span>
      ${modules.map((module) => `
        <button class="nav-item" type="button" data-view="${esc(module.id)}" aria-current="${module.id === currentView ? 'page' : 'false'}">
          <span class="nav-glyph">${esc(module.glyph)}</span><span>${esc(module.label)}</span>
          ${module.id === 'approvals' && model.approvals.length ? `<b>${model.approvals.length}</b>` : ''}
        </button>`).join('')}
    </div>`).join('');
}

function renderPulse() {
  const pulse = model.pulse;
  const cards = [
    ['Agents active', `${pulse.agentFleet.active}/${pulse.agentFleet.total}`, `${pulse.agentFleet.needsApproval} awaiting approval`, 'AI'],
    ['Governance', pulse.governance, `${pulse.executionQueue ?? 0} effect(s) queued for execution`, 'GV'],
    ['Evidence coverage', `${pulse.evidenceCoverage}%`, 'Verification objects linked', 'EV'],
    ['Decision latency', pulse.decisionLatency, `${pulse.openApprovals} open approvals`, 'AP'],
  ];
  document.querySelector('#pulse-grid').innerHTML = cards.map(([label, value, note, glyph]) => `
    <article class="pulse-card"><span class="pulse-glyph">${glyph}</span><div><small>${esc(label)}</small><strong>${esc(value)}</strong><p>${esc(note)}</p></div></article>`).join('');
}

function statusLabel(status) {
  return status === 'approval' ? 'Approval required' : status === 'observe' ? 'Observing' : 'Active';
}

function renderAgents() {
  document.querySelector('#agent-grid').innerHTML = model.agents.slice(0, 6).map((agent) => `
    <article class="agent-card">
      <div class="agent-card__top"><span class="agent-status agent-status--${esc(agent.status)}"><i></i>${esc(statusLabel(agent.status))}</span><span class="authority-badge">L${esc(agent.authority)}</span></div>
      <h3>${esc(agent.name)}</h3><p>${esc(agent.task)}</p>
      <div class="agent-card__meta"><span>${esc(agent.domain)}</span><span>${esc(agent.confidence)}% confidence</span></div>
    </article>`).join('');
}

function approvalRowsMarkup() {
  return model.approvals.length ? model.approvals.map((approval) => `
    <article class="approval-row">
      <span class="risk-dot risk-dot--${esc(approval.risk)}"></span>
      <span class="approval-row__body"><strong>${esc(approval.title)}</strong><small>${esc(approval.owner)} · ${esc(approval.age)}</small><em>${esc(approval.reason)}</em></span>
      <span class="approval-row__side">
        <span class="authority-badge">${esc(approval.authority)}</span>
        <span class="approval-actions">
          <button type="button" data-approval-id="${esc(approval.id)}" data-decision="APPROVED">Approve</button>
          <button type="button" data-approval-id="${esc(approval.id)}" data-decision="REJECTED">Reject</button>
        </span>
      </span>
    </article>`).join('') : '<p class="empty-state">No governed effects are waiting for human approval.</p>';
}

function renderApprovalWorkspace() {
  const count = document.querySelector('#module-approval-count');
  const list = document.querySelector('#module-approval-list');
  if (count) count.textContent = model.approvals.length;
  if (list) list.innerHTML = approvalRowsMarkup();
}

function renderApprovals() {
  document.querySelector('#approval-count').textContent = model.approvals.length;
  document.querySelector('#approval-list').innerHTML = approvalRowsMarkup();
  renderApprovalWorkspace();
}

function renderEvents() {
  document.querySelector('#event-list').innerHTML = model.events.map((event) => `
    <article class="event-row"><span class="event-icon event-icon--${esc(event.severity)}"></span><div><strong>${esc(event.type)}</strong><p>${esc(event.summary)}</p><small>${esc(event.source)} · ${esc(event.time)}</small></div></article>`).join('');
}

function renderRisks() {
  document.querySelector('#risk-list').innerHTML = model.risks.map((risk) => `
    <article class="risk-row"><div class="risk-row__heading"><div><strong>${esc(risk.title)}</strong><small>${esc(risk.id)}</small></div><span class="risk-score risk-score--${esc(risk.band)}">${esc(risk.score)}</span></div><div class="risk-meter"><i style="width:${Number(risk.score)}%"></i></div><small>${esc(risk.band.toUpperCase())} · trend ${esc(risk.trend)}</small></article>`).join('');
}

function renderAll() {
  renderPulse(); renderAgents(); renderApprovals(); renderEvents(); renderRisks(); renderNavigation();
}

function foundationCards(module) {
  const common = [
    ['Authority boundary', 'All state-changing effects route through policy, capability authority and approval gates.'],
    ['Event integration', `${module.label} subscribes to typed VAOS events rather than polling unrelated domains.`],
    ['Evidence contract', 'Every governed action emits verification and audit evidence into the digital thread.'],
  ];
  const specific = {
    agents: ['Fleet registry', 'Persistent specialist agents, current task, confidence, tool access and authority level.'],
    vibpe: ['Engineering intelligence', 'Requirement, configuration, FEA, material and validation context routed through VIBPE.'],
    engineering: ['Engineering change control', 'Baseline, configuration, verification impact and release evidence under one thread.'],
    'qa-capa': ['Closed-loop quality', 'NCR detection → analysis → CAPA proposal → approval → verification → closure evidence.'],
    projects: ['Execution controls', 'Milestones, schedule risk, resource constraints and decision dependencies.'],
    risk: ['Risk evolution', 'Dynamic risk scoring, propagation, scenario exposure and mitigation ownership.'],
    governance: ['Autonomy governor', 'RBAC/ABAC, policy-as-code, authority graph and human escalation rules.'],
    'digital-thread': ['Traceability graph', 'Requirement → design → analysis → manufacturing → inspection → verification → release.'],
    evidence: ['Evidence ledger', 'Immutable references to decisions, tests, approvals, verification and source authority.'],
    approvals: ['Decision inbox', 'Human-gated effects are approved or rejected here and persisted to the governance event ledger.'],
    admin: ['Platform control', 'Identity, integrations, agent capabilities, environments and system configuration.'],
  };
  return specific[module.id] ? [specific[module.id], ...common] : common;
}

function statusTone(value) {
  const status = String(value || '').toUpperCase();
  if (['SUCCEEDED','EXECUTED','APPROVED','OPEN','CHANGE_RECORDED','ESCALATED','VERIFIED','RELEASED'].includes(status)) return 'success';
  if (['FAILED','DEAD_LETTER','REJECTED','CLOSED','SUPERSEDED'].includes(status)) return 'danger';
  if (['PENDING','LEASED','AWAIT_APPROVAL','MITIGATING','MONITORED','ACTION_PENDING','INVESTIGATING'].includes(status)) return 'warning';
  return 'neutral';
}

function renderDomainWorkspace(module) {
  const section = document.querySelector('#domain-workspace');
  const foundation = document.querySelector('#module-foundation-grid');
  const domain = model.domainWorkspaces?.[module.id];

  if (!domain) {
    section.hidden = true;
    foundation.hidden = false;
    return false;
  }

  section.hidden = false;
  foundation.hidden = true;
  document.querySelector('#domain-workspace-title').textContent = domain.title;
  document.querySelector('#domain-workspace-copy').textContent = domain.copy;
  document.querySelector('#domain-record-count').textContent = domain.records.length;

  document.querySelector('#domain-summary').innerHTML = [
    ['Records', domain.summary.total, 'DB'],
    ['Succeeded', domain.summary.succeeded, 'OK'],
    ['Verified', domain.summary.verified, 'EV'],
    ['Retried', domain.summary.retried, 'RT'],
  ].map(([label, value, glyph]) => `
    <article class="domain-summary-card"><span>${esc(glyph)}</span><div><small>${esc(label)}</small><strong>${esc(value)}</strong></div></article>
  `).join('');

  const list = document.querySelector('#domain-record-list');
  list.innerHTML = domain.records.length ? domain.records.map((record) => `
    <article class="domain-record-row" role="button" tabindex="0" data-domain-record-id="${esc(record.id)}" data-domain-module="${esc(module.id)}" aria-label="Open digital thread for ${esc(record.resourceId)}">
      <div class="domain-record-primary">
        <small>${esc(domain.resourceLabel)}</small>
        <strong>${esc(record.resourceId)}</strong>
        <span class="domain-status domain-status--${statusTone(record.status)}">${esc(record.status)}</span>
      </div>
      <div class="domain-trace">
        <span><small>Intent</small><strong class="domain-status domain-status--${statusTone(record.intent.status)}">${esc(record.intent.status)}</strong></span>
        <span><small>Approval</small><strong class="domain-status domain-status--${statusTone(record.approval.status)}">${esc(record.approval.status)}</strong></span>
        <span><small>Execution</small><strong class="domain-status domain-status--${statusTone(record.execution.status)}">${esc(record.execution.status)}</strong></span>
        <span><small>Attempts</small><strong>${esc(record.execution.attempts)} / ${esc(record.execution.maxAttempts || '—')}</strong></span>
        <span><small>Evidence</small><strong>${esc(record.evidence.count)}</strong></span>
      </div>
      <div class="domain-record-meta">
        <span><small>Adapter</small><strong>${esc(record.execution.adapterId || '—')}</strong></span>
        <span><small>Latest event</small><strong>${esc(record.latestEvent.type || '—')}</strong></span>
        <span><small>Recorded</small><strong>${esc(record.recordedAt ? new Date(record.recordedAt).toLocaleString() : '—')}</strong></span>
      </div>
    </article>
  `).join('') : '<p class="empty-state">No durable operational records have been created for this domain yet.</p>';

  return true;
}

function jsonForDisplay(value) {
  return value ? JSON.stringify(value, null, 2) : 'No persisted object.';
}

function lineageCell(label, value, tone = 'neutral', detail = '') {
  return `
    <article class="thread-lineage-cell">
      <small>${esc(label)}</small>
      <strong class="domain-status domain-status--${tone}">${esc(value || '—')}</strong>
      <span>${esc(detail || '')}</span>
    </article>
  `;
}

function openDomainThread(moduleId, recordId) {
  const domain = model.domainWorkspaces?.[moduleId];
  const record = domain?.records.find((item) => item.id === recordId);
  const traceDialog = document.querySelector('#domain-thread-dialog');
  if (!record || !traceDialog) return;

  document.querySelector('#domain-thread-title').textContent = `${domain.resourceLabel} · ${record.resourceId}`;
  document.querySelector('#domain-thread-subtitle').textContent =
    `${domain.title} · persisted governance and execution lineage`;

  document.querySelector('#domain-thread-lineage').innerHTML = [
    lineageCell('Domain state', record.status, statusTone(record.status), record.recordedAt ? new Date(record.recordedAt).toLocaleString() : ''),
    lineageCell('Intent', record.intent.status, statusTone(record.intent.status), record.intent.id || ''),
    lineageCell('Approval', record.approval.status, statusTone(record.approval.status), record.approval.decidedBy || ''),
    lineageCell('Execution', record.execution.status, statusTone(record.execution.status), `${record.execution.attempts}/${record.execution.maxAttempts || '—'} attempt(s)`),
    lineageCell('Evidence', record.evidence.count ? 'VERIFIED' : 'NONE', record.evidence.count ? 'success' : 'neutral', record.evidence.verifiedAt ? new Date(record.evidence.verifiedAt).toLocaleString() : ''),
  ].join('');

  document.querySelector('#domain-thread-effect').textContent = jsonForDisplay(record.thread.effect);
  document.querySelector('#domain-thread-evidence').textContent = jsonForDisplay(record.thread.verification);

  const events = record.thread.events || [];
  document.querySelector('#domain-thread-event-count').textContent = events.length;
  document.querySelector('#domain-thread-timeline').innerHTML = events.length ? events.map((item) => `
    <article class="thread-event">
      <span class="thread-event__rail"><i></i></span>
      <div>
        <div class="thread-event__heading">
          <strong>${esc(item.type)}</strong>
          <small>#${esc(item.sequence)} · ${esc(item.occurredAt ? new Date(item.occurredAt).toLocaleString() : '—')}</small>
        </div>
        <p>${esc(item.source)}</p>
        <pre>${esc(JSON.stringify(item.payload || {}, null, 2))}</pre>
      </div>
    </article>
  `).join('') : '<p class="empty-state">No related persisted events were found for this record.</p>';

  traceDialog.showModal();
}

function traceLane(domain) {
  return model.traceGraph.nodes.filter((node) => node.domain === domain);
}

function traceOption(node) {
  return `<option value="${esc(node.id)}">${esc(node.domainLabel)} · ${esc(node.resourceId)}</option>`;
}

function renderEnterpriseTraceGraph() {
  const section = document.querySelector('#enterprise-trace-graph');
  const graph = model.traceGraph;
  section.hidden = false;

  const sourceSelect = document.querySelector('#trace-author-source');
  const targetSelect = document.querySelector('#trace-author-target');
  const previousSource = sourceSelect?.value;
  const previousTarget = targetSelect?.value;
  const options = graph.nodes.map(traceOption).join('');
  if (sourceSelect) {
    sourceSelect.innerHTML = options;
    if (previousSource && graph.nodes.some((node) => node.id === previousSource)) sourceSelect.value = previousSource;
  }
  if (targetSelect) {
    targetSelect.innerHTML = options;
    if (previousTarget && graph.nodes.some((node) => node.id === previousTarget)) targetSelect.value = previousTarget;
    else if (graph.nodes.length > 1) targetSelect.selectedIndex = 1;
  }

  document.querySelector('#trace-summary').innerHTML = [
    ['Records', graph.summary.totalNodes, 'DB'],
    ['Explicit links', graph.summary.totalLinks, 'LN'],
    ['Connected', graph.summary.connectedNodes, 'OK'],
    ['Orphans', graph.summary.orphanNodes, 'OR'],
  ].map(([label, value, glyph]) => `
    <article class="domain-summary-card"><span>${esc(glyph)}</span><div><small>${esc(label)}</small><strong>${esc(value)}</strong></div></article>
  `).join('');

  const lanes = [
    ['QA_CAPA', 'QA / CAPA'],
    ['ENGINEERING_BASELINE', 'Engineering'],
    ['PROJECT_RISK', 'Project / Risk'],
  ];
  document.querySelector('#trace-node-layer').innerHTML = lanes.map(([domain, label]) => `
    <section class="trace-lane">
      <header><span>${esc(label)}</span><b>${traceLane(domain).length}</b></header>
      <div class="trace-lane__nodes">
        ${traceLane(domain).map((node) => `
          <article class="trace-node" tabindex="0" role="button"
            data-trace-node-id="${esc(node.id)}"
            data-domain-record-id="${esc(node.recordId)}"
            data-domain-module="${esc(node.moduleId)}">
            <span class="trace-node__glyph">${esc(node.glyph)}</span>
            <div><small>${esc(node.domainLabel)}</small><strong>${esc(node.resourceId)}</strong><em>${esc(node.status)}</em></div>
            <span class="trace-node__evidence">${esc(node.evidenceCount)} EV</span>
          </article>
        `).join('') || '<p class="empty-state">No durable records.</p>'}
      </div>
    </section>
  `).join('');

  const index = new Map(graph.nodes.map((node) => [node.id, node]));
  document.querySelector('#trace-edge-list').innerHTML = graph.edges.length ? graph.edges.map((edge) => {
    const source = index.get(edge.sourceNodeId);
    const target = index.get(edge.targetNodeId);
    return `
      <article class="trace-link-row">
        <span>${esc(source?.resourceId || edge.sourceNodeId)}</span>
        <strong>${esc(edge.relationType)}</strong>
        <span>${esc(target?.resourceId || edge.targetNodeId)}</span>
        <small>${edge.governed ? '<b class="trace-governed-badge">GOVERNED</b> · ' : ''}${esc(edge.createdBy)}${edge.createdAt ? ` · ${esc(new Date(edge.createdAt).toLocaleString())}` : ''}</small>
      </article>
    `;
  }).join('') : '<p class="empty-state">No explicit cross-domain links have been persisted yet.</p>';

  requestAnimationFrame(drawTraceEdges);
}

function drawTraceEdges() {
  const canvas = document.querySelector('#trace-canvas');
  const svg = document.querySelector('#trace-edge-svg');
  if (!canvas || !svg || currentView !== 'digital-thread') return;

  const bounds = canvas.getBoundingClientRect();
  svg.setAttribute('viewBox', `0 0 ${Math.max(1,bounds.width)} ${Math.max(1,bounds.height)}`);
  svg.innerHTML = '<defs><marker id="trace-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z"></path></marker></defs>';

  const elements = new Map([...document.querySelectorAll('[data-trace-node-id]')].map((item) => [item.dataset.traceNodeId, item]));
  for (const edge of model.traceGraph.edges) {
    const source = elements.get(edge.sourceNodeId);
    const target = elements.get(edge.targetNodeId);
    if (!source || !target) continue;
    const a = source.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    const x1 = a.right - bounds.left;
    const y1 = a.top + a.height / 2 - bounds.top;
    const x2 = b.left - bounds.left;
    const y2 = b.top + b.height / 2 - bounds.top;
    const bend = Math.max(55, Math.abs(x2 - x1) * .42);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`);
    path.setAttribute('class', 'trace-edge-path');
    path.setAttribute('marker-end', 'url(#trace-arrow)');
    svg.appendChild(path);
  }
}

function renderModule(module) {
  document.querySelector('#module-hero-group').textContent = module.group.toUpperCase();
  document.querySelector('#module-hero-title').textContent = module.label;
  document.querySelector('#module-hero-description').textContent = module.description;

  const graphSection = document.querySelector('#enterprise-trace-graph');
  const domainSection = document.querySelector('#domain-workspace');
  const foundation = document.querySelector('#module-foundation-grid');
  const approvalPanel = document.querySelector('#module-approval-panel');

  graphSection.hidden = true;
  domainSection.hidden = true;
  foundation.hidden = true;
  approvalPanel.hidden = true;

  if (module.id === 'digital-thread') {
    renderEnterpriseTraceGraph();
    return;
  }

  if (module.id === 'approvals') {
    approvalPanel.hidden = false;
    renderApprovalWorkspace();
    return;
  }

  const hasDomain = renderDomainWorkspace(module);
  if (!hasDomain) {
    foundation.hidden = false;
    foundation.innerHTML = foundationCards(module).map(([title, copy], index) => `
      <article class="foundation-card"><span>0${index + 1}</span><h3>${esc(title)}</h3><p>${esc(copy)}</p></article>`).join('');
  }
}

function setView(view, { push = true } = {}) {
  const module = model.modules.find((item) => item.id === view) || model.modules[0];
  currentView = module.id;
  moduleTitle.textContent = module.label; moduleGroup.textContent = module.group; moduleDescription.textContent = module.description;
  commandView.hidden = module.id !== 'command'; moduleView.hidden = module.id === 'command';
  if (module.id !== 'command') renderModule(module);
  renderNavigation();
  if (push) {
    const url = new URL(window.location.href);
    if (module.id === 'command') url.searchParams.delete('view'); else url.searchParams.set('view', module.id);
    window.history.pushState({ view: module.id }, '', url);
  }
}

function renderCommandResults(query = '') {
  const q = query.trim().toLowerCase();
  const modules = model.modules.filter((module) => !q || `${module.label} ${module.group} ${module.description}`.toLowerCase().includes(q));
  commandResults.innerHTML = modules.map((module) => `<button type="button" data-view="${esc(module.id)}"><span class="nav-glyph">${esc(module.glyph)}</span><div><strong>${esc(module.label)}</strong><small>${esc(module.description)}</small></div></button>`).join('') || '<p>No matching module.</p>';
}

async function loadControlPlane() {
  const response = await fetch('/api/control-plane', { credentials: 'same-origin', cache: 'no-store' });
  if (response.status === 401) { window.location.replace('/login'); return null; }
  if (!response.ok) throw new Error('control_plane_unavailable');
  return response.json();
}

async function decideApproval(button) {
  const approvalId = button.dataset.approvalId;
  const decision = button.dataset.decision;
  const row = button.closest('.approval-row');
  row?.querySelectorAll('button').forEach((item) => { item.disabled = true; });

  try {
    const response = await fetch('/api/approvals', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ approvalId, decision }),
    });
    if (!response.ok) throw new Error('approval_failed');
    const payload = await loadControlPlane();
    if (!payload) return;
    model = payload.model;
    renderAll();
    if (currentView !== 'command') renderModule(model.modules.find((item) => item.id === currentView) || model.modules[0]);
  } catch {
    row?.querySelectorAll('button').forEach((item) => { item.disabled = false; });
    window.alert('VAOS could not persist this approval decision.');
  }
}

function parseTraceNodeId(value) {
  const separator = String(value || '').indexOf(':');
  if (separator < 1) return null;
  return {
    domain: value.slice(0, separator),
    recordId: value.slice(separator + 1),
  };
}

function newTraceProposalKey() {
  if (globalThis.crypto?.randomUUID) return `digital-thread:${globalThis.crypto.randomUUID()}`;
  const bytes = new Uint32Array(4);
  globalThis.crypto?.getRandomValues?.(bytes);
  return `digital-thread:${[...bytes].join('-') || Date.now()}`;
}

async function submitTraceLinkProposal(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const source = parseTraceNodeId(document.querySelector('#trace-author-source')?.value);
  const target = parseTraceNodeId(document.querySelector('#trace-author-target')?.value);
  const relationType = document.querySelector('#trace-author-relation')?.value;
  const reason = document.querySelector('#trace-author-reason')?.value.trim() || '';
  const status = document.querySelector('#trace-author-status');
  const button = form.querySelector('button[type="submit"]');

  if (!source || !target || reason.length < 3) {
    status.textContent = 'Select both records and provide a reason.';
    return;
  }
  if (source.domain === target.domain && source.recordId === target.recordId) {
    status.textContent = 'A record cannot be linked to itself.';
    return;
  }

  traceProposalKey ||= newTraceProposalKey();
  button.disabled = true;
  status.textContent = 'Submitting governed relationship proposal…';

  try {
    const response = await fetch('/api/intents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': traceProposalKey,
      },
      credentials: 'same-origin',
      body: JSON.stringify({
        agentId: 'knowledge',
        actionType: 'DIGITAL_THREAD.CREATE_LINK',
        risk: 'medium',
        reason,
        payload: {
          sourceDomain: source.domain,
          sourceRecordId: source.recordId,
          relationType,
          targetDomain: target.domain,
          targetRecordId: target.recordId,
        },
      }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = result?.error?.code || 'PROPOSAL_FAILED';
      throw new Error(code);
    }

    traceProposalKey = null;
    form.reset();
    status.textContent = result?.data?.status === 'AWAIT_APPROVAL'
      ? 'Proposal persisted. Human approval is now required.'
      : `Proposal status: ${result?.data?.status || 'PERSISTED'}`;

    const refreshed = await loadControlPlane();
    if (refreshed) {
      model = refreshed.model;
      renderAll();
      renderEnterpriseTraceGraph();
    }
  } catch (error) {
    status.textContent = `Proposal not persisted: ${error.message}. Retry will reuse the same intent key.`;
  } finally {
    button.disabled = false;
  }
}

function wireInteractions() {
  document.addEventListener('click', (event) => {
    const approval = event.target.closest('[data-approval-id][data-decision]');
    if (approval) { decideApproval(approval); return; }

    const domainRecord = event.target.closest('[data-domain-record-id][data-domain-module]');
    if (domainRecord) {
      openDomainThread(domainRecord.dataset.domainModule, domainRecord.dataset.domainRecordId);
      return;
    }

    const trigger = event.target.closest('[data-view]');
    if (!trigger) return;
    setView(trigger.dataset.view);
    if (dialog?.open) dialog.close();
  });

  document.addEventListener('keydown', (event) => {
    const domainRecord = event.target.closest?.('[data-domain-record-id][data-domain-module]');
    if (!domainRecord || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    openDomainThread(domainRecord.dataset.domainModule, domainRecord.dataset.domainRecordId);
  });

  document.querySelector('#domain-thread-close')?.addEventListener('click', () => {
    document.querySelector('#domain-thread-dialog')?.close();
  });
  document.querySelector('#trace-author-form')?.addEventListener('submit', submitTraceLinkProposal);

  commandButton?.addEventListener('click', () => { renderCommandResults(); dialog.showModal(); queueMicrotask(() => commandInput.focus()); });
  commandInput?.addEventListener('input', () => renderCommandResults(commandInput.value));
  window.addEventListener('popstate', () => setView(new URL(window.location.href).searchParams.get('view') || 'command', { push: false }));
  window.addEventListener('resize', () => { if (currentView === 'digital-thread') requestAnimationFrame(drawTraceEdges); });
}

async function bootstrap() {
  try {
    const payload = await loadControlPlane();
    if (!payload) return;
    model = payload.model;
    identityEmail.textContent = payload.session.email;
    environmentLabel.textContent = model.environment;
    renderAll();
    wireInteractions();
    setView(new URL(window.location.href).searchParams.get('view') || 'command', { push: false });
    loading.hidden = true; shell.hidden = false;
  } catch {
    loading.querySelector('strong').textContent = 'VAOS control plane unavailable';
    loading.querySelector('span').textContent = 'Refresh to retry. No unauthorised workspace data has been displayed.';
  }
}

logout?.addEventListener('click', async () => {
  try { await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }); }
  finally { window.location.replace('/login'); }
});

bootstrap();
