import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
test('real PostgreSQL persistence, revision conflicts, server key, RBAC and browser denial',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema vaos_private;
 create function vaos_private.assert_server_key(k text) returns void language plpgsql as $$begin if k is distinct from 'test-key' then raise exception 'VAOS_SERVER_KEY_INVALID';end if;end$$;`);
 await db.exec(await readFile(new URL('../../supabase/migrations/20261016192556_conversational_bi_definitions.sql',import.meta.url),'utf8'));
 const definition={version:1,title:'Finance test definition',metric:'activity',chart:'bar',agents:['finance'],from:'2026-10-01',to:'2026-10-15'};
 const id='123e4567-e89b-42d3-a456-426614174000';
 const rpc=(action,revision=0,email='shyamsundhar1982@gmail.com',key='test-key',d=definition)=>db.query('select public.vaos_dashboard_definitions($1,$2,$3,$4,$5,$6,$7::jsonb) as data',[key,email,action,id,revision,'private',JSON.stringify(d)]);
 assert.equal((await rpc('save')).rows[0].data.revision,1);
 assert.equal((await rpc('open')).rows[0].data.definition.title,definition.title);
 await assert.rejects(()=>rpc('save'),/REVISION_CONFLICT/);
 assert.equal((await rpc('save',1)).rows[0].data.revision,2);
 await assert.rejects(()=>rpc('open',0,'kaaviyam1519@gmail.com'),/FOUNDER_ONLY/);
 await assert.rejects(()=>rpc('list',0,undefined,'bad'),/SERVER_KEY_INVALID/);
 await assert.rejects(()=>rpc('save',2,undefined,undefined,{...definition,agents:['unknown']}),/AGENT_INVALID/);
 await db.exec('set role authenticated');await assert.rejects(()=>rpc('list'),/permission denied/);await db.exec('reset role');
 const result=await db.query(`select count(*)::int as n from vaos_private.dashboard_definitions`);assert.equal(result.rows[0].n,1);
 }finally{await db.close();}
});
