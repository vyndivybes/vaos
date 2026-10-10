import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../../supabase/migrations/20261010180000_production_l5_scoped_claim.sql',import.meta.url),'utf8');
test('scoped database claim is restricted to the production L5 hourly observation',()=>{
 for(const text of ["i.agent_id='production'","i.action_type='PRODUCTION.OBSERVE_WIP'","i.authority=5",
  "j.action_type='PRODUCTION.OBSERVE_WIP'","i.idempotency_key=p_idempotency_key","FOR UPDATE OF j SKIP LOCKED",
  'vaos_private.assert_server_key','REVOKE ALL','GRANT EXECUTE'])assert.ok(sql.includes(text),text);
 assert.ok(!sql.includes("IN ('PRODUCTION.RELEASE_JOB'"));
});
