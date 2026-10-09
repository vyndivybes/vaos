import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL(
  '../../supabase/migrations/20261007201351_digital_employee_snapshot_contract_v3.sql',
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


const workstateMigrationUrl = new URL(
  '../../supabase/migrations/20261010001500_digital_employee_verified_activity_v1.sql',
  import.meta.url,
);

test('verified successful business work records the owner heartbeat, not qualification activation', async () => {
  const sql = await readFile(workstateMigrationUrl, 'utf8');
  assert.match(sql,/after update of status on vaos_private\.execution_jobs/i);
  assert.match(sql,/NEW\.status <> 'SUCCEEDED'/i);
  assert.match(sql,/NEW\.action_type LIKE 'WORKFORCE\.%'/i);
  assert.match(sql,/ev\.verification @> '\{"verified":true\}'::jsonb/i);
  assert.match(sql,/where i\.id = NEW\.intent_id/i);
  assert.match(sql,/where id = v_agent_id and status = 'ACTIVE'/i);
});

test('handoff heartbeat requires a different verifier and hashed matching work report', async () => {
  const sql = await readFile(workstateMigrationUrl, 'utf8');
  assert.match(sql,/after update of status on vaos_private\.agent_handoffs/i);
  assert.match(sql,/NEW\.verified_by_agent_id = NEW\.to_agent_id/i);
  assert.match(sql,/w\.author_agent_id = NEW\.to_agent_id/i);
  assert.match(sql,/w\.action_type = NEW\.requested_job/i);
  assert.match(sql,/w\.report_sha256 IS NOT NULL/i);
});

test('workforce backfill uses only independently verified historic proof timestamps', async () => {
  const sql = await readFile(workstateMigrationUrl, 'utf8');
  assert.match(sql,/WHERE j\.status='SUCCEEDED'/i);
  assert.match(sql,/j\.action_type NOT LIKE 'WORKFORCE\.%'/i);
  assert.match(sql,/WHERE h\.status='COMPLETED'/i);
  assert.match(sql,/MAX\(proof_at\)/i);
  assert.doesNotMatch(sql.replace(/^--.*$/gm,''),/set heartbeat_at\s*=\s*now\(\)/i);
});

test('authenticated control snapshot reports open mission assignment and recorded-work signal', async () => {
  const sql = await readFile(workstateMigrationUrl, 'utf8');
  assert.match(sql,/create function public\.vaos_control_snapshot\(p_server_key text\)/i);
  assert.match(sql,/public\.vaos_control_snapshot_pre_workstate\(p_server_key\)/i);
  assert.match(sql,/wp\.owner_agent_id = item\.value->>'id'/i);
  assert.match(sql,/wp\.status in \('PLANNED','READY','IN_PROGRESS','BLOCKED'\)/i);
  assert.match(sql,/'assignmentStatus'/);
  assert.match(sql,/'activitySignal'/);
  assert.match(sql,/grant execute on function public\.vaos_control_snapshot\(text\) to service_role/i);
});
