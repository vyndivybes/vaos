import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

test('mission dispatch is authenticated, atomic, dependency-safe and qualification-gated', async () => {
  const dir = new URL('../../supabase/migrations/', import.meta.url);
  const names = (await readdir(dir)).filter((name) => name.endsWith('_operating_mission_dispatch_v1.sql'));
  assert.equal(names.length, 1, 'single dispatch migration required');
  const sql = await readFile(new URL(names[0], dir), 'utf8');
  assert.match(sql, /create or replace function public\.vaos_dispatch_operating_mission/i);
  assert.match(sql, /perform vaos_private\.assert_server_key\(p_server_key\)/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /qualification_level\s*>=\s*minimum_qualification_level/i);
  assert.match(sql, /status\s*=\s*'ACTIVE'/i);
  assert.match(sql, /depends_on/i);
  assert.match(sql, /child\.status\s*<>\s*'COMPLETED'/i);
  assert.match(sql, /HANDOFF_DEPENDENCY_NOT_COMPLETE/i);
  assert.match(sql, /revoke all on function public\.vaos_dispatch_operating_mission/i);
  assert.match(sql, /grant execute on function public\.vaos_dispatch_operating_mission.*to service_role/is);
});

test('Edge route exposes only operator dispatch and does not expose agent transitions', async () => {
  const edge = await readFile(new URL('../../supabase/functions/vaos-control/index.ts', import.meta.url), 'utf8');
  const worker = await readFile(new URL('../../apps/web/cloudflare-worker.mjs', import.meta.url), 'utf8');
  assert.match(edge, /operation === 'dispatchOperatingMission'/);
  assert.match(edge, /rpcName = 'vaos_dispatch_operating_mission'/);
  assert.match(worker, /'\/api\/missions': missions/);
  const missions = await readFile(new URL('../../apps/web/api/missions.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(missions, /transitionHandoff\(/);
  assert.doesNotMatch(missions, /completeExecution\(/);
});
