import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../../supabase/migrations/20261009230000_infisical_staged_watchdog_key_rotation_v1.sql',import.meta.url),'utf8');

test('rotation migration only stages hashed credentials and never enables provider routing',()=>{
  assert.match(sql,/ADD COLUMN IF NOT EXISTS pending_key_hash text/);
  assert.match(sql,/pending_key_hash ~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(sql,/pending_key_expires_at>v_now/);
  assert.doesNotMatch(sql,/SET\s+enabled\s*=\s*true/i);
  assert.doesNotMatch(sql,/provider_control_state/);
  assert.doesNotMatch(sql,/RAISE NOTICE .*p_server_key/i);
});

test('active credential remains valid while candidate is staged',()=>{
  assert.match(sql,/key_hash=v_hash\s+OR\s+\(pending_key_hash=v_hash/);
  assert.match(sql,/AND enabled/);
  assert.match(sql,/identity_id='github-infisical-production-watchdog'/);
});

test('pending key expires and authentication is tracked independently',()=>{
  assert.match(sql,/pending_key_expires_at>v_now/);
  assert.match(sql,/pending_last_authenticated_at=CASE/);
  assert.match(sql,/pending_key_hash=v_hash/);
  assert.match(sql,/last_authenticated_at=v_now/);
});

test('replaces only scoped private identity assertion with restricted grants',()=>{
  assert.match(sql,/CREATE OR REPLACE FUNCTION vaos_private\.assert_infisical_watchdog_key/);
  assert.match(sql,/SECURITY DEFINER/);
  assert.match(sql,/extensions\.digest/);
  assert.match(sql,/VAOS_INFISICAL_WATCHDOG_IDENTITY_INVALID/);
  assert.match(sql,/REVOKE ALL ON FUNCTION vaos_private\.assert_infisical_watchdog_key\(text\)/);
});
