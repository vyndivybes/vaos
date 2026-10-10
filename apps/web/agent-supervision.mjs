const form = document.querySelector('#supervision-form');
const input = document.querySelector('#supervision-mission');
const message = document.querySelector('#supervision-message');
const report = document.querySelector('#supervision-report');
const runButton = document.querySelector('#supervision-run');
let busy = false, observedMission = null;

function rows(selector, entries) {
  const body = document.querySelector(selector);
  body.replaceChildren();
  for (const values of entries) {
    const row = document.createElement('tr');
    for (const value of values) {
      const cell = document.createElement('td'); cell.textContent = String(value ?? 'Not recorded'); row.appendChild(cell);
    }
    body.appendChild(row);
  }
}

function render(monitor) {
  report.hidden = false;
  observedMission = monitor.mission?.id || null;
  document.querySelector('#supervision-observed').textContent = `Observed: ${monitor.observedAt}`;
  rows('#supervision-agents', monitor.agents.map(a => [a.name || a.id, a.lifecycle,
    `${a.qualificationLevel ?? 'Unknown'} / ${a.qualified ? 'qualified' : 'held'}`, a.heartbeatAt]));
  const approvals = document.querySelector('#supervision-approvals'); approvals.replaceChildren();
  for (const a of monitor.pendingApprovals.length ? monitor.pendingApprovals : [{ id: 'No pending approvals' }]) {
    const li = document.createElement('li'); li.textContent = [a.id, a.actionType].filter(Boolean).join(' · '); approvals.appendChild(li);
  }
  const mission = monitor.mission;
  document.querySelector('#supervision-mission-state').textContent = mission
    ? `${mission.id} · ${mission.status} · blocked work packages: ${mission.blockedWorkPackages.length}` : 'Select a mission to inspect orchestration.';
  rows('#supervision-handoffs', (mission?.handoffs || []).map(h => [h.id, `${h.owner} / ${h.action}`, h.status, h.reason]));
  runButton.disabled = !monitor.controls.runSafeEnabled || !mission?.handoffs.some(h => h.eligible);
  document.querySelector('#supervision-control-state').textContent = monitor.controls.runSafeEnabled
    ? 'Read-only control enabled. One handoff per request.' : 'Read-only control disabled pending commissioning.';
}

async function refresh({ control = false } = {}) {
  if (busy) return;
  const missionId = control ? observedMission : input.value.trim();
  if (missionId && !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{3,95}$/.test(missionId)) {
    message.textContent = 'Enter a valid mission ID (4–96 characters).'; return;
  }
  busy = true; runButton.disabled = true;
  if (!control) report.hidden = true;
  message.textContent = control ? 'Coordinating one governed handoff…' : 'Reading authoritative agent state…';
  try {
    const response = await fetch('/api/langgraph' + (!control && missionId ? '?missionId=' + encodeURIComponent(missionId) : ''), {
      method: control ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
      headers: { Accept: 'application/json', ...(control ? { 'Content-Type': 'application/json' } : {}) },
      ...(control ? { body: JSON.stringify({ operation: 'RUN_SAFE', missionId }) } : {}),
    });
    const result = await response.json();
    if (!response.ok || result.data?.status === 'HOLD') {
      report.hidden = true;
      message.textContent = response.status === 401 ? 'Sign in to VAOS to monitor agents.'
        : (result.data?.reason || result.error?.message || 'Supervision unavailable')
          + (control ? ' Inspect mission evidence before retrying.' : '');
      return;
    }
    render(result.data.monitor);
    message.textContent = control ? 'Handoff verified and persisted evidence read back. Refresh to see the new state.' : 'Persisted agent and mission state loaded.';
    if (control) runButton.disabled = true;
  } catch {
    report.hidden = true;
    message.textContent = control ? 'Control response unavailable. Inspect mission evidence before retrying.' : 'Agent supervision could not be loaded.';
  } finally { busy = false; }
}

form.addEventListener('submit', event => { event.preventDefault(); refresh(); });
runButton.addEventListener('click', () => refresh({ control: true }));
input.addEventListener('input', () => { runButton.disabled = true; });
refresh();
