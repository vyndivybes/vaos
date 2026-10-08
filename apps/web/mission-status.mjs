import { summarizeMissionSnapshot } from './lib/mission-status-model.mjs?v=20261008-v1';

const form = document.querySelector('#mission-lookup');
const idInput = document.querySelector('#mission-id');
const message = document.querySelector('#mission-message');
const report = document.querySelector('#mission-report');
const jobRows = document.querySelector('#mission-rows');
const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{3,95}$/;
let currentMissionId = null;
let reading = false;

function setText(selector, value) {
  document.querySelector(selector).textContent = String(value ?? '');
}

function rowCell(row, value) {
  const cell = document.createElement('td');
  cell.textContent = String(value ?? '');
  row.appendChild(cell);
}

function render(status) {
  report.hidden = false;
  setText('#mission-title', status.id);
  setText('#mission-state', status.readyForClosure ? 'READY FOR HUMAN CLOSURE' : status.status);
  setText('#mission-completed', `${status.completed} / ${status.total}`);
  setText('#mission-percent', `${status.percent}%`);
  setText('#mission-updated', status.updatedAt ? new Date(status.updatedAt).toLocaleString() : 'Not recorded');
  document.querySelector('#mission-progress').value = status.percent;
  const warning = document.querySelector('#mission-warning');
  warning.hidden = !status.warning;
  warning.textContent = status.warning || '';
  jobRows.replaceChildren();
  for (const job of status.jobs) {
    const row = document.createElement('tr');
    rowCell(row, job.action);
    rowCell(row, job.owner);
    rowCell(row, job.verified ? 'VERIFIED' : job.status);
    rowCell(row, job.verifiedBy || 'Pending independent review');
    rowCell(row, job.evidenceRefs.join(', ') || 'Not yet verified');
    jobRows.appendChild(row);
  }
}

async function fetchMission(missionId) {
  if (reading || !missionId) return;
  reading = true;
  message.textContent = 'Loading authoritative mission snapshot…';
  try {
    const response = await fetch('/api/missions?missionId=' + encodeURIComponent(missionId), {
      method: 'GET', credentials: 'same-origin', cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (response.status === 401) {
      report.hidden = true;
      message.textContent = 'Authentication required. Sign in to VAOS, then return to this mission page.';
      return;
    }
    if (!response.ok) throw new Error('Mission unavailable (' + response.status + ')');
    const envelope = await response.json();
    const view = summarizeMissionSnapshot(envelope.data);
    render(view);
    message.textContent = view.readyForClosure
      ? 'Evidence-backed closure readiness confirmed. Final human authorisation remains required.'
      : 'Read-only snapshot loaded. Awaiting remaining work and independent reviews.';
  } catch (error) {
    report.hidden = true;
    message.textContent = error?.message || 'Mission status could not be loaded.';
  } finally {
    reading = false;
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const missionId = idInput.value.trim();
  if (!idPattern.test(missionId)) {
    message.textContent = 'Enter a valid mission ID (4–96 letters, digits, dots, underscores, hyphens or colons).';
    return;
  }
  currentMissionId = missionId;
  const url = new URL(window.location.href);
  url.searchParams.set('missionId', missionId);
  window.history.replaceState(null, '', url);
  fetchMission(missionId);
});

const initial = new URL(window.location.href).searchParams.get('missionId');
if (initial && idPattern.test(initial)) {
  idInput.value = initial;
  currentMissionId = initial;
  fetchMission(initial);
}

setInterval(() => {
  if (currentMissionId && document.visibilityState === 'visible') fetchMission(currentMissionId);
}, 60_000);
