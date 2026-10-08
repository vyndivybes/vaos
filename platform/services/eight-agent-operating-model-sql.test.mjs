import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

async function migrationSql() {
  const migrationsDir = new URL('../../supabase/migrations/', import.meta.url);
  const names = (await readdir(migrationsDir))
    .filter((name) => name.endsWith('_eight_agent_operating_model_v1.sql'));
  assert.equal(names.length, 1, 'exactly one eight-agent operating-model migration must exist');
  return readFile(new URL(names[0], migrationsDir), 'utf8');
}

test('durable operating model persists missions, work packages, handoffs and immutable events', async () => {
  const sql = await migrationSql();
  for (const table of ['missions', 'work_packages', 'agent_handoffs', 'agent_handoff_events']) {
    assert.match(sql, new RegExp(`create table if not exists vaos_private\\.${table}`, 'i'));
    assert.match(sql, new RegExp(`alter table vaos_private\\.${table} enable row level security`, 'i'));
  }
  assert.match(sql, /catalog_version text not null/i);
  assert.match(sql, /minimum_qualification_level smallint not null/i);
  assert.match(sql, /monitoring_interval_minutes integer/i);
  assert.match(sql, /work_package_qualification_check check \(minimum_qualification_level between 1 and 4\)/i);
  assert.match(sql, /work_package_monitoring_interval_check/i);
  assert.match(sql, /version integer not null default 1/i);
  assert.match(sql, /foreign key \(mission_id\)/i);
  assert.match(sql, /foreign key \(work_package_id\)/i);
});

test('durable operating model provides server-key-gated RPCs and revokes public execution', async () => {
  const sql = await migrationSql();
  for (const fn of [
    'vaos_create_operating_mission',
    'vaos_create_operating_handoff',
    'vaos_transition_operating_handoff',
    'vaos_operating_mission_snapshot',
  ]) {
    assert.match(sql, new RegExp(`create or replace function public\\.${fn}`, 'i'));
    assert.match(sql, new RegExp(`revoke all on function public\\.${fn}`, 'i'));
    assert.match(sql, new RegExp(`grant execute on function public\\.${fn}`, 'i'));
  }
  assert.match(sql, /perform vaos_private\.assert_server_key\(p_server_key\)/i);
  assert.match(sql, /p_expected_version integer/i);
  assert.match(sql, /HANDOFF_VERSION_CONFLICT/i);
});

test('database state machine is fail-closed and Release authority is not expanded', async () => {
  const sql = await migrationSql();
  assert.match(sql, /PENDING.*ACCEPT.*ACCEPTED/is);
  assert.match(sql, /ACCEPTED.*COMPLETE.*COMPLETED/is);
  assert.match(sql, /RETURN_FOR_CORRECTION.*RETURNED/is);
  assert.match(sql, /ESCALATE.*ESCALATED/is);
  assert.match(sql, /HANDOFF_TRANSITION_INVALID/i);
  assert.match(sql, /owner_agent_id in \('orchestrator','project','vibpe','qa','risk','security','knowledge','release'\)/i);
  assert.doesNotMatch(sql, /update\s+vaos_private\.digital_employees\s+set\s+.*release/is);
});


test('Edge control plane exposes all durable operating-model operations through exact RPC names', async () => {
  const edge = await readFile(new URL('../../supabase/functions/vaos-control/index.ts', import.meta.url), 'utf8');
  for (const [operation, rpc] of [
    ['createOperatingMission', 'vaos_create_operating_mission'],
    ['createOperatingHandoff', 'vaos_create_operating_handoff'],
    ['transitionOperatingHandoff', 'vaos_transition_operating_handoff'],
    ['operatingMissionSnapshot', 'vaos_operating_mission_snapshot'],
  ]) {
    assert.match(edge, new RegExp(`operation === '${operation}'`));
    assert.match(edge, new RegExp(`rpcName = '${rpc}'`));
  }
});
