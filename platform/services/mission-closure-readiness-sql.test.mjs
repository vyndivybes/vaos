import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

async function sqlSource() {
  const dir = new URL('../../supabase/migrations/', import.meta.url);
  const paths = (await readdir(dir)).filter((p) => p.endsWith('_mission_closure_readiness_v1.sql'));
  assert.equal(paths.length, 1);
  return readFile(new URL(paths[0], dir), 'utf8');
}

test('closure readiness requires independently verified complete handoffs for every work package', async () => {
  const sql = await sqlSource();
  assert.match(sql, /create or replace function public\.vaos_prepare_operating_mission_closure/i);
  assert.match(sql, /perform vaos_private\.assert_server_key\(p_server_key\)/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /v_total\s*<=\s*0/i);
  assert.match(sql, /status\s*<>\s*'COMPLETED'/i);
  assert.match(sql, /verified_by_agent_id/i);
  assert.match(sql, /h\.to_agent_id/i);
  assert.match(sql, /outcome\s*=\s*'VERIFY'/i);
  assert.match(sql, /MISSION_CLOSURE_NOT_READY/i);
  assert.match(sql, /READY_FOR_CLOSURE/i);
});

test('closure preparation is idempotent, service-key-only, and cannot finalize or release', async () => {
  const sql = await sqlSource();
  assert.match(sql, /outcome','REPLAY'/i);
  assert.match(sql, /revoke all on function public\.vaos_prepare_operating_mission_closure/i);
  assert.match(sql, /grant execute on function public\.vaos_prepare_operating_mission_closure.*to service_role/is);
  assert.doesNotMatch(sql, /set status\s*=\s*'COMPLETED'/i);
  assert.doesNotMatch(sql, /status\s*=\s*'RELEASED'/i);
});

test('Edge routes readiness as a server-key gated RPC', async () => {
  const edge = await readFile(new URL('../../supabase/functions/vaos-control/index.ts', import.meta.url),'utf8');
  assert.match(edge, /operation === 'prepareOperatingMissionClosure'/i);
  assert.match(edge, /rpcName = 'vaos_prepare_operating_mission_closure'/i);
});
