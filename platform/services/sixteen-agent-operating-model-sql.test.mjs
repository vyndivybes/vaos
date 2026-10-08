import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const operational=[
  'commercial','procurement','inventory','production',
  'maintenance','finance','people','engineering-configuration',
];

async function migrationSql(){
  const dir=new URL('../../supabase/migrations/',import.meta.url);
  const names=(await readdir(dir)).filter(name=>name.endsWith('_sixteen_agent_operating_model_v2.sql'));
  assert.equal(names.length,1,'single sixteen-agent operating-model v2 migration required');
  return readFile(new URL(names[0],dir),'utf8');
}

test('v2 expands durable mission owners, handoff participants and event actors to all sixteen employees',async()=>{
  const sql=await migrationSql();
  for(const id of operational){
    assert.match(sql,new RegExp(`owner_agent_id in \\([^)]*'${id}'`,'is'),id);
    assert.match(sql,new RegExp(`from_agent_id in \\([^)]*'${id}'`,'is'),id);
    assert.match(sql,new RegExp(`to_agent_id in \\([^)]*'${id}'`,'is'),id);
    assert.match(sql,new RegExp(`by_agent_id in \\([^)]*'${id}'`,'is'),id);
  }
  assert.match(sql,/workforceSize',16/i);
  assert.match(sql,/writeBridgeExecutionEnabled',false/i);
  assert.match(sql,/operationalMutations','PREPARE_ONLY'/i);
});

test('v2 dispatch keeps server-key, qualification, dependency and duplicate-assignment gates with a bounded sixteen-person ceiling',async()=>{
  const sql=await migrationSql();
  assert.match(sql,/create or replace function public\.vaos_dispatch_operating_mission/i);
  assert.match(sql,/perform vaos_private\.assert_server_key\(p_server_key\)/i);
  assert.match(sql,/p_max_assignments[^;]+> 16/is);
  assert.match(sql,/de\.status='ACTIVE'/i);
  assert.match(sql,/de\.qualification_level\s*>=\s*w\.minimum_qualification_level/i);
  assert.match(sql,/child\.status<>'COMPLETED'/i);
  assert.match(sql,/prior\.work_package_id=w\.id/i);
  assert.match(sql,/for update of w skip locked/i);
  assert.match(sql,/revoke all on function public\.vaos_dispatch_operating_mission/i);
  assert.match(sql,/grant execute on function public\.vaos_dispatch_operating_mission.*to service_role/is);
});

test('v2 does not activate VYNDI writes or mutate Digital Employee qualification/status',async()=>{
  const sql=await migrationSql();
  assert.doesNotMatch(sql,/update\s+vaos_private\.digital_employees/i);
  assert.doesNotMatch(sql,/executionEnabled\s*=\s*true/i);
  assert.doesNotMatch(sql,/GOVERNED_EXECUTION/i);
  assert.match(sql,/writeBridgeExecutionEnabled',false/i);
});
