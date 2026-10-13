import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const sql=await readFile(new URL('../../supabase/migrations/20261013173000_founder_workforce_overview_v1.sql',import.meta.url),'utf8');
const edge=await readFile(new URL('../../supabase/functions/vaos-control/index.ts',import.meta.url),'utf8');
test('analytics projection is founder-only and does not grant public or production write authority',()=>{
 assert.match(sql,/vaos_private\.assert_server_key\(p_server_key\)/);
 assert.match(sql,/shyamsundhar1982@gmail\.com/);
 assert.match(sql,/revoke all on function public\.vaos_founder_workforce_overview/);
 assert.match(sql,/grant execute on function public\.vaos_founder_workforce_overview\(text,text\) to service_role/);
 assert.doesNotMatch(sql,/create table|insert into|delete from|update vaos_private/i);
 assert.match(edge,/operation === 'founderWorkforceOverview'/);
 assert.match(edge,/vaos_founder_workforce_overview/);
});
test('qualification drills cannot silently inflate operational output or verified closure trends',()=>{
 assert.match(sql,/w\.mission_id not like 'VAOS-QUAL-%'/);
 assert.match(sql,/w\.mission_id like 'VAOS-QUAL-%'/);
 assert.match(sql,/h\.mission_id not like 'VAOS-QUAL-%'/);
 assert.match(sql,/v\.report_sha256 is not null/);
 assert.match(sql,/h\.verified_by_agent_id <> h\.to_agent_id/);
});
