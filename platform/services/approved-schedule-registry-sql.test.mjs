import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
test('schedule approval registry is private, append-only, maker-checker bound and server-key protected',async()=>{
 const folder=new URL('../../supabase/migrations/',import.meta.url);
 const files=(await readdir(folder)).filter(x=>x.endsWith('_approved_schedule_registry_v1.sql'));
 assert.equal(files.length,1);
 const sql=await readFile(new URL(files[0],folder),'utf8');
 assert.match(sql,/create table.*vaos_private\.approved_program_baselines/is);
 assert.match(sql,/approved_by.*submitted_by/is);
 assert.match(sql,/row level security/is);
 assert.match(sql,/vaos_get_approved_program_baseline/is);
 assert.match(sql,/vaos_private\.assert_server_key\(p_server_key\)/);
 assert.match(sql,/revoke all.*public, anon, authenticated/is);
 assert.match(sql,/grant execute.*service_role/is);
 assert.match(sql,/reject_schedule_approval_mutation/i);
 assert.doesNotMatch(sql,/insert\s+into\s+vaos_private\.approved_program_baselines/i);
});
