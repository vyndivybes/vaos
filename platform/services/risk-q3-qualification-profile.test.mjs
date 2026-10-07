import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL(
  '../../supabase/migrations/20261007192207_digital_workforce_risk_q3_profile_v1.sql',
  import.meta.url,
);

test('Risk Q3 qualification is evidence-gated and preserves existing Q3 profiles', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /RISK_Q3_ENTERPRISE_RISK_GOVERNANCE_V1/);
  assert.match(sql, /v_scope\s*:=\s*'ENTERPRISE_RISK_GOVERNANCE'/);
  assert.match(sql, /i\.agent_id='risk'/);
  assert.match(sql, /i\.action_type='PROJECT\.ESCALATE_RISK'/);

  assert.match(sql, /'verified_risk_escalation_effects','required',2/);
  assert.match(sql, /'distinct_risk_resources','required',2/);
  assert.match(sql, /'verified_recovery_path','required',1/);
  assert.match(sql, /'human_approved_risk_actions','required',2/);
  assert.match(sql, /'executed_cross_domain_risk_trace','required',1/);

  assert.match(sql, /source_domain='PROJECT_RISK' or l\.target_domain='PROJECT_RISK'/);
  assert.match(sql, /l\.source_domain <> l\.target_domain/);
  assert.match(sql, /l\.execution_job_id is not null/);

  assert.match(sql, /VIBPE_Q3_ENGINEERING_BASELINE_GOVERNANCE_V1/);
  assert.match(sql, /QA_Q3_CAPA_GOVERNANCE_V1/);
});
