import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL(
  '../../supabase/migrations/20261008060000_security_q4_identity_assurance_v1.sql',
  import.meta.url,
);

test('Security Q4 migration defines durable identity observations and a high-assurance assessor', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /create table if not exists vaos_private\.security_identity_observations/i);
  assert.match(sql, /SECURITY\.OBSERVE_IDENTITY/);
  assert.match(sql, /vaos_observe_identity/);
  assert.match(sql, /vaos_get_identity_observation/);
  assert.match(sql, /vaos_link_security_qualification_trace/);
  assert.match(sql, /SECURITY_Q4_IDENTITY_ASSURANCE_V1/);
  assert.match(sql, /IDENTITY_SECURITY_ASSURANCE/);
  assert.match(sql, /verified_security_identity_observations/);
  assert.match(sql, /distinct_security_resources/);
  assert.match(sql, /verified_recovery_path/);
  assert.match(sql, /human_approved_security_actions/);
  assert.match(sql, /executed_cross_domain_security_trace/);
  assert.match(sql, /fail_closed_security_denial/);
});
