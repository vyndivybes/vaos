import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL(
  '../../supabase/migrations/20261007203500_risk_q3_final_evidence_v1.sql',
  import.meta.url,
);

test('Risk Q3 final evidence RPCs are narrowly scoped to the approved recovery drill', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /vaos_claim_qualification_recovery/);
  assert.match(sql, /QUALIFICATION_RECOVERY_DRILL_RETRY/);
  assert.match(sql, /PROJECT\.ESCALATE_RISK/);
  assert.match(sql, /qualificationMode/);
  assert.match(sql, /qualificationRecoveryDrill/);
  assert.match(sql, /attempt_count\s*<>\s*1|attempt_count\s*=\s*1/);
  assert.match(sql, /vaos_link_risk_qualification_trace/);
  assert.match(sql, /ENGINEERING_BASELINE/);
  assert.match(sql, /MITIGATES_RISK/);
  assert.match(sql, /execution_job_id/);
});
