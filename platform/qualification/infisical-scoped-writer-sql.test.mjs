import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migrationPath=new URL('../../supabase/migrations/20261008212700_infisical_scoped_commissioning_v1.sql',import.meta.url);
const edgePath=new URL('../../supabase/functions/vaos-control/index.ts',import.meta.url);

test('commissioning key is separately hashed and cannot authorize generic providerStatePut',()=>{
  const sql=readFileSync(migrationPath,'utf8');
  assert.match(sql,/github-infisical-commissioning/);
  assert.match(sql,/extensions\.digest/);
  assert.match(sql,/VAOS_SERVER_KEY_INVALID/);
  assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION public\.vaos_provider_state_put/);
  assert.doesNotMatch(sql,/UPDATE vaos_private\.server_credentials/);
  assert.doesNotMatch(sql,/DELETE FROM vaos_private\.server_credentials/);
  assert.doesNotMatch(sql,/INSERT INTO vaos_private\.server_credentials/);
});
test('commissioning RPC only allows health record or disable and always locks Infisical row',()=>{
  const sql=readFileSync(migrationPath,'utf8');
  assert.match(sql,/p_action NOT IN \('record-health','disable'\)/);
  assert.match(sql,/provider_id\s*=\s*'infisical'/);
  assert.match(sql,/FOR UPDATE/);
  assert.match(sql,/jsonb_set\(/);
  assert.match(sql,/\{health\}/);
  assert.match(sql,/\{enabled\}/);
  assert.match(sql,/to_jsonb\(false\)/);
  assert.doesNotMatch(sql,/\{enabled\}[^;]*to_jsonb\(true\)/s);
  assert.doesNotMatch(sql,/p_action\s*=\s*'activate'/);
});
test('health writes verify status, bounded timestamp and authority reference',()=>{
  const sql=readFileSync(migrationPath,'utf8');
  assert.match(sql,/status.*NOT IN \('healthy','degraded','unhealthy','unknown'\)/);
  assert.match(sql,/abs\(extract\(epoch from \(clock_timestamp\(\)-v_checked_at\)\)\)/);
  assert.match(sql,/evidenceRef/);
  assert.ok(sql.includes('github[.]com/vyndivybes/vaos/actions/runs/'));
});
test('commissioning route only maps to narrow RPC, not generic full state write',()=>{
  const src=readFileSync(edgePath,'utf8');
  assert.match(src,/operation === 'infisicalCommissioningControl'/);
  assert.match(src,/rpcName = 'vaos_infisical_commissioning_control'/);
  assert.match(src,/p_action: payload\.action/);
  assert.match(src,/p_health: payload\.health/);
  assert.match(src,/p_authority_ref: payload\.authorityRef/);
});
test('commissioning RPC privileges exclude anon, authenticated and public',()=>{
  const sql=readFileSync(migrationPath,'utf8');
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.vaos_infisical_commissioning_control/);
  assert.match(sql,/FROM PUBLIC, anon, authenticated/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.vaos_infisical_commissioning_control/);
  assert.match(sql,/TO service_role/);
});
