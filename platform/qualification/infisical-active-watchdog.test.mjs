import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const migration=readFileSync(new URL('../../supabase/migrations/20261008230000_infisical_active_health_watchdog_v2.sql',import.meta.url),'utf8');
const identity=readFileSync(new URL('../../supabase/migrations/20261008233000_infisical_durable_watchdog_identity_v1.sql',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../../.github/workflows/infisical-scoped-commissioning.yml',import.meta.url),'utf8');
const writer=readFileSync(new URL('../../scripts/qualification/record-infisical-commissioning.mjs',import.meta.url),'utf8');

test('active health refresh preserves routing and cannot activate',()=>{
  assert.match(migration,/v_after:=jsonb_set\(v_before,'\{health\}'/);
  const healthBranch=migration.split("IF p_action='record-health' THEN")[1].split('  ELSE')[0];
  assert.doesNotMatch(healthBranch,/\{enabled\}/);
  assert.match(migration,/p_action NOT IN \('record-health','disable'\)/);
});
test('temporary commissioning lease is promoted and revoked',()=>{
  assert.match(identity,/infisical_watchdog_identity/);
  assert.match(identity,/rotation_due_at/);
  assert.match(identity,/DELETE FROM vaos_private\.infisical_commissioning_lease/);
  const assertion=identity.split('CREATE OR REPLACE FUNCTION vaos_private.assert_infisical_watchdog_key')[1]
    .split('CREATE OR REPLACE FUNCTION vaos_private.assert_infisical_commissioning_key')[0];
  assert.doesNotMatch(assertion,/expires_at/);
  assert.match(assertion,/AND enabled/);
  assert.match(assertion,/last_authenticated_at/);
});
test('scheduled watchdog is every fifteen minutes and fails closed',()=>{
  assert.match(workflow,/cron: '\*\/15 \* \* \* \*'/);
  assert.match(workflow,/steps\.live\.outcome == 'failure'/);
  assert.match(workflow,/INFISICAL_COMMISSION_ACTION: disable/);
  assert.match(workflow,/INFISICAL_DISABLE_CONFIRM: DISABLE-ONLY/);
  assert.match(workflow,/VAOS_INFISICAL_WATCHDOG_KEY/);
  assert.doesNotMatch(workflow,/VAOS_INFISICAL_COMMISSIONING_KEY:/);
});
test('health writer accepts preserved enabled state but disable requires false',()=>{
  assert.doesNotMatch(writer,/result\.enabled!==false\|\|/);
  assert.match(writer,/action==='disable'&&result\.enabled!==false/);
  assert.match(writer,/INFISICAL_COMMISSION_HEALTH_NOT_PERSISTED/);
  assert.match(writer,/VAOS_INFISICAL_WATCHDOG_KEY/);
});
