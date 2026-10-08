import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { summarizeMissionSnapshot } from './mission-status-model.mjs';

const snapshot = (status = 'ACTIVE') => ({
  mission: { id: 'VAOS-QUAL-READONLY-20261008-01', status, updated_at: '2026-10-08T13:46:17Z' },
  workPackages: [
    { id: 'wp-project', action_type: 'PROJECT.TRACK_DEPENDENCY', status: 'COMPLETED', owner_agent_id: 'project' },
    { id: 'wp-knowledge', action_type: 'KNOWLEDGE.DETECT_GAP', status: 'COMPLETED', owner_agent_id: 'knowledge' },
    { id: 'wp-release', action_type: 'RELEASE.CHECK_OPEN_ITEMS', status: 'COMPLETED', owner_agent_id: 'release' },
  ],
  handoffs: [
    { id: 'h-project', work_package_id: 'wp-project', status: 'COMPLETED', to_agent_id: 'project', verified_by_agent_id: 'orchestrator', evidence_refs: ['ev1','REVIEWED:ev1'] },
    { id: 'h-knowledge', work_package_id: 'wp-knowledge', status: 'COMPLETED', to_agent_id: 'knowledge', verified_by_agent_id: 'qa', evidence_refs: ['ev2','REVIEWED:ev2'] },
    { id: 'h-release', work_package_id: 'wp-release', status: 'COMPLETED', to_agent_id: 'release', verified_by_agent_id: 'project', evidence_refs: ['ev3','REVIEWED:ev3'] },
  ],
});

test('verified three-job qualification is labelled ready only after database state confirms it', () => {
  const result = summarizeMissionSnapshot(snapshot('READY_FOR_CLOSURE'));
  assert.equal(result.id, 'VAOS-QUAL-READONLY-20261008-01');
  assert.equal(result.completed, 3);
  assert.equal(result.total, 3);
  assert.equal(result.percent, 100);
  assert.equal(result.readyForClosure, true);
  assert.deepEqual(result.jobs.map(j => j.verifiedBy), ['orchestrator','qa','project']);
});

test('unverified handoff is never presented as successfully verified', () => {
  const s = snapshot();
  s.handoffs[2].status = 'PENDING';
  s.handoffs[2].verified_by_agent_id = null;
  s.handoffs[2].evidence_refs = [];
  s.workPackages[2].status = 'READY';
  const result = summarizeMissionSnapshot(s);
  assert.equal(result.completed, 2);
  assert.equal(result.percent, 67);
  assert.equal(result.readyForClosure, false);
  assert.equal(result.jobs[2].verifiedBy, null);
});

test('self-certification and missing verification evidence fail closed even if package says completed', () => {
  const self = snapshot('READY_FOR_CLOSURE');
  self.handoffs[1].verified_by_agent_id = 'knowledge';
  assert.equal(summarizeMissionSnapshot(self).completed, 2);
  assert.equal(summarizeMissionSnapshot(self).readyForClosure, false);
  const missing = snapshot('READY_FOR_CLOSURE');
  missing.handoffs[2].evidence_refs = ['ev3'];
  assert.equal(summarizeMissionSnapshot(missing).completed, 2);
  assert.equal(summarizeMissionSnapshot(missing).readyForClosure, false);
});

test('malformed snapshot and duplicate work package IDs fail closed', () => {
  assert.throws(() => summarizeMissionSnapshot({}), /MISSION_STATUS_SNAPSHOT_INVALID/);
  const s = snapshot();
  s.workPackages[1].id = s.workPackages[0].id;
  assert.throws(() => summarizeMissionSnapshot(s), /MISSION_STATUS_WORK_PACKAGES_INVALID/);
});

test('operator status surface uses existing authenticated read-only API, safe text rendering, and workspace link', async () => {
  const root = new URL('../', import.meta.url);
  const [html, js, workspace] = await Promise.all([
    readFile(new URL('mission-status.html', root),'utf8'),
    readFile(new URL('mission-status.mjs', root),'utf8'),
    readFile(new URL('workspace.html', root),'utf8'),
  ]);
  assert.match(html, /Mission Status/i);
  assert.match(html, /id="mission-id"/);
  assert.match(js, /\/api\/missions\?missionId=/);
  assert.match(js, /credentials:\s*'same-origin'/);
  assert.match(js, /textContent/);
  assert.doesNotMatch(js, /innerHTML|method:\s*['"]POST['"]/);
  assert.match(workspace, /href="\/mission-status\.html"/);
});
