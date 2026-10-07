import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL(
  '../../supabase/migrations/20261007201200_digital_employee_snapshot_contract_v3.sql',
  import.meta.url,
);

test('digital employee snapshot exposes responsibility contract identity required by qualification mode', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /create or replace function vaos_private\.digital_employee_snapshot\(p_employee_id text\)/i);
  assert.match(sql, /'responsibilityContractId',\s*e\.responsibility_contract_id/i);
  assert.match(sql, /'capabilities',\s*e\.capabilities/i);
  assert.match(sql, /'modelRequirements',\s*e\.model_requirements/i);
  assert.match(sql, /revoke all on function vaos_private\.digital_employee_snapshot\(text\)/i);
});
