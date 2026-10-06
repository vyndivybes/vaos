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

function renderApprovals() {
  document.querySelector('#approval-count').textContent = model.approvals.length;
  const list = document.querySelector('#approval-list');
  list.innerHTML = model.approvals.length ? model.approvals.map((approval) => `
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
    <article class="domain-record-row">
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

function renderModule(module) {
  document.querySelector('#module-hero-group').textContent = module.group.toUpperCase();
  document.querySelector('#module-hero-title').textContent = module.label;
  document.querySelector('#module-hero-description').textContent = module.description;
  const hasDomain = renderDomainWorkspace(module);
  if (!hasDomain) {
    document.querySelector('#module-foundation-grid').innerHTML = foundationCards(module).map(([title, copy], index) => `
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

function wireInteractions() {
  document.addEventListener('click', (event) => {
    const approval = event.target.closest('[data-approval-id][data-decision]');
    if (approval) { decideApproval(approval); return; }

    const trigger = event.target.closest('[data-view]');
    if (!trigger) return;
    setView(trigger.dataset.view);
    if (dialog?.open) dialog.close();
  });

  commandButton?.addEventListener('click', () => { renderCommandResults(); dialog.showModal(); queueMicrotask(() => commandInput.focus()); });
  commandInput?.addEventListener('input', () => renderCommandResults(commandInput.value));
  window.addEventListener('popstate', () => setView(new URL(window.location.href).searchParams.get('view') || 'command', { push: false }));
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
