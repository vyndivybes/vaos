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
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

function moduleGroups(modules) {
  return modules.reduce((groups, module) => {
    (groups[module.group] ||= []).push(module);
    return groups;
  }, {});
}

function renderNavigation() {
  const groups = moduleGroups(model.modules);
  nav.innerHTML = Object.entries(groups).map(([group, modules]) => `
    <div class="nav-group">
      <span class="nav-group__label">${esc(group)}</span>
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
    ['Governance', pulse.governance, 'Policy gates enforcing effects', 'GV'],
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
  document.querySelector('#approval-list').innerHTML = model.approvals.map((approval) => `
    <button class="approval-row" type="button" data-view="approvals">
      <span class="risk-dot risk-dot--${esc(approval.risk)}"></span>
      <span class="approval-row__body"><strong>${esc(approval.title)}</strong><small>${esc(approval.owner)} · ${esc(approval.age)}</small><em>${esc(approval.reason)}</em></span>
      <span class="authority-badge">${esc(approval.authority)}</span>
    </button>`).join('');
}

function renderEvents() {
  document.querySelector('#event-list').innerHTML = model.events.map((event) => `
    <article class="event-row"><span class="event-icon event-icon--${esc(event.severity)}"></span><div><strong>${esc(event.type)}</strong><p>${esc(event.summary)}</p><small>${esc(event.source)} · ${esc(event.time)}</small></div></article>`).join('');
}

function renderRisks() {
  document.querySelector('#risk-list').innerHTML = model.risks.map((risk) => `
    <article class="risk-row"><div class="risk-row__heading"><div><strong>${esc(risk.title)}</strong><small>${esc(risk.id)}</small></div><span class="risk-score risk-score--${esc(risk.band)}">${esc(risk.score)}</span></div><div class="risk-meter"><i style="width:${Number(risk.score)}%"></i></div><small>${esc(risk.band.toUpperCase())} · trend ${esc(risk.trend)}</small></article>`).join('');
}

function foundationCards(module) {
  const common = [
    ['Authority boundary', 'All state-changing effects route through policy, capability authority and approval gates.'],
    ['Event integration', `${module.label} will subscribe to typed VAOS events rather than polling unrelated domains.`],
    ['Evidence contract', 'Every governed action will emit verification and audit evidence into the digital thread.'],
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
    approvals: ['Decision inbox', 'Human-gated actions ordered by risk, impact, confidence and decision age.'],
    admin: ['Platform control', 'Identity, integrations, agent capabilities, environments and system configuration.'],
  };
  return specific[module.id] ? [specific[module.id], ...common] : common;
}

function renderModule(module) {
  document.querySelector('#module-hero-group').textContent = module.group.toUpperCase();
  document.querySelector('#module-hero-title').textContent = module.label;
  document.querySelector('#module-hero-description').textContent = module.description;
  document.querySelector('#module-foundation-grid').innerHTML = foundationCards(module).map(([title, copy], index) => `
    <article class="foundation-card"><span>0${index + 1}</span><h3>${esc(title)}</h3><p>${esc(copy)}</p></article>`).join('');
}

function setView(view, { push = true } = {}) {
  const module = model.modules.find((item) => item.id === view) || model.modules[0];
  currentView = module.id;
  moduleTitle.textContent = module.label;
  moduleGroup.textContent = module.group;
  moduleDescription.textContent = module.description;
  commandView.hidden = module.id !== 'command';
  moduleView.hidden = module.id === 'command';
  if (module.id !== 'command') renderModule(module);
  renderNavigation();
  if (push) {
    const url = new URL(window.location.href);
    if (module.id === 'command') url.searchParams.delete('view');
    else url.searchParams.set('view', module.id);
    window.history.pushState({ view: module.id }, '', url);
  }
}

function renderCommandResults(query = '') {
  const q = query.trim().toLowerCase();
  const modules = model.modules.filter((module) => !q || `${module.label} ${module.group} ${module.description}`.toLowerCase().includes(q));
  commandResults.innerHTML = modules.map((module) => `<button type="button" data-view="${esc(module.id)}"><span class="nav-glyph">${esc(module.glyph)}</span><div><strong>${esc(module.label)}</strong><small>${esc(module.description)}</small></div></button>`).join('') || '<p>No matching module.</p>';
}

function wireInteractions() {
  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-view]');
    if (!trigger) return;
    setView(trigger.dataset.view);
    if (dialog?.open) dialog.close();
  });

  commandButton?.addEventListener('click', () => {
    renderCommandResults();
    dialog.showModal();
    queueMicrotask(() => commandInput.focus());
  });
  commandInput?.addEventListener('input', () => renderCommandResults(commandInput.value));
  window.addEventListener('popstate', () => {
    const view = new URL(window.location.href).searchParams.get('view') || 'command';
    setView(view, { push: false });
  });
}

async function bootstrap() {
  try {
    const response = await fetch('/api/control-plane', { credentials: 'same-origin', cache: 'no-store' });
    if (response.status === 401) {
      window.location.replace('/login');
      return;
    }
    if (!response.ok) throw new Error('control_plane_unavailable');
    const payload = await response.json();
    model = payload.model;
    identityEmail.textContent = payload.session.email;
    environmentLabel.textContent = model.environment;
    renderPulse();
    renderAgents();
    renderApprovals();
    renderEvents();
    renderRisks();
    wireInteractions();
    const view = new URL(window.location.href).searchParams.get('view') || 'command';
    setView(view, { push: false });
    loading.hidden = true;
    shell.hidden = false;
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
