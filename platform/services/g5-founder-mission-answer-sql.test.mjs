import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const base=new URL('../../supabase/migrations/20261015130000_g5_founder_mission_answer_summary.sql',import.meta.url);
test('G5 mission answer SQL reads existing private mission/handoff evidence only, with valid private server key',async()=>{
 const sql=await readFile(base,'utf8');
 assert.match(sql,/vaos_private\.assert_server_key\(p_server_key\)/);
 assert.match(sql,/from vaos_private\.missions/);
 assert.match(sql,/vaos_private\.agent_handoffs/);
 assert.match(sql,/vaos_private\.handoff_work_evidence/);
 assert.match(sql,/verified_by_agent_id<>h\.to_agent_id/);
 assert.match(sql,/REVIEWED:/);
 assert.match(sql,/limit 10/);
 assert.match(sql,/VAOS_FOUNDER_MISSION_SUMMARY_V1/);
 assert.match(sql,/revoke all on function.*\n\s*from public,anon,authenticated/i);
 assert.match(sql,/grant execute on function.*\n\s*to service_role/i);
 assert.doesNotMatch(sql,/create table|drop table|insert into|delete from|update\s+vaos_private/i);
});
