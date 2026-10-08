import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir,readFile } from 'node:fs/promises';

test('mission SLA delay is allowlisted consistently across three service-key database gates', async () => {
  const dir=new URL('../../supabase/migrations/',import.meta.url);
  const matches=(await readdir(dir)).filter(name=>name.endsWith('_project_mission_sla_screen_v1.sql'));
  assert.equal(matches.length,1);
  const sql=await readFile(new URL(matches[0],dir),'utf8');
  for(const fn of [
    'vaos_record_handoff_work_evidence',
    'vaos_list_runnable_missions',
    'vaos_prepare_operating_mission_closure',
  ]) assert.ok(sql.includes('create or replace function public.'+fn));
  assert.ok((sql.match(/'PROJECT\.DETECT_DELAY'/g)||[]).length>=3);
  assert.ok(sql.includes('assert_server_key(p_server_key)'));
  assert.ok(sql.includes('report_sha256'));
  assert.ok(sql.includes('verified_by_agent_id'));
  assert.ok(sql.includes('to service_role'));
  assert.equal(/grant execute[\s\S]*to anon/.test(sql),false);
});

test('mission SLA detection cannot alter or approve actual project schedules',async ()=>{
  const dir=new URL('../../supabase/migrations/',import.meta.url);
  const [name]=(await readdir(dir)).filter(name=>name.endsWith('_project_mission_sla_screen_v1.sql'));
  const sql=await readFile(new URL(name,dir),'utf8');
  assert.doesNotMatch(sql,/update\s+vaos_private\.work_packages/i);
  assert.doesNotMatch(sql,/set\s+status\s*=\s*'COMPLETED'/i);
  assert.doesNotMatch(sql,/grant\s+execute.*to\s+authenticated/is);
});
