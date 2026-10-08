import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const migration=readFileSync(new URL('../../supabase/migrations/20261008230000_infisical_active_health_watchdog_v2.sql',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../../.github/workflows/infisical-scoped-commissioning.yml',import.meta.url),'utf8');
const writer=readFileSync(new URL('../../scripts/qualification/record-infisical-commissioning.mjs',import.meta.url),'utf8');

test('active health refresh preserves routing and cannot activate',()=>{
  assert.match(migration,/v_after:=jsonb_set\(v_before,'\{health\}'/);
  assert.doesNotMatch(migration,/record-health[\s\S]*\{enabled\}.*true/);
  assert.match(migration,/p_action NOT IN \('record-health','disable'\)/);
  assert.match(migration,/p_action='disable'/);
});
test('scheduled watchdog is every fifteen minutes and fails closed',()=>{
  assert.match(workflow,/cron: '\*\/15 \* \* \* \*'/);
  assert.match(workflow,/steps\.live\.outcome == 'failure'/);
  assert.match(workflow,/INFISICAL_COMMISSION_ACTION: disable/);
  assert.match(workflow,/INFISICAL_DISABLE_CONFIRM: DISABLE-ONLY/);
});
test('health writer accepts preserved enabled state but disable requires false',()=>{
  assert.doesNotMatch(writer,/result\.enabled!==false\|\|/);
  assert.match(writer,/action==='disable'&&result\.enabled!==false/);
  assert.match(writer,/INFISICAL_COMMISSION_HEALTH_NOT_PERSISTED/);
});
