import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');

test('rotation preflight uses next credential but no revoked old credential',()=>{
  const workflow=read('../../.github/workflows/provider-wave2-infisical-rotation-preflight.yml');
  assert.match(workflow,/INFISICAL_CLIENT_SECRET:\s*\$\{\{\s*secrets\.INFISICAL_NEXT_CLIENT_SECRET\s*\}\}/);
  assert.match(workflow,/INFISICAL_CLIENT_ID:\s*\$\{\{\s*secrets\.INFISICAL_NEXT_CLIENT_ID\s*\}\}/);
  assert.doesNotMatch(workflow,/INFISICAL_REVOKED_CLIENT_SECRET/);
  assert.match(workflow,/infisical-wave2-live\.mjs/);
});

test('production run uses NEXT as current, original repository secret as revoked',()=>{
  const workflow=read('../../.github/workflows/provider-wave2-infisical-production-qualification.yml');
  assert.match(workflow,/INFISICAL_CLIENT_SECRET:\s*\$\{\{\s*secrets\.INFISICAL_NEXT_CLIENT_SECRET\s*\}\}/);
  assert.match(workflow,/INFISICAL_REVOKED_CLIENT_SECRET:\s*\$\{\{\s*secrets\.INFISICAL_CLIENT_SECRET\s*\}\}/);
  assert.match(workflow,/INFISICAL_CLIENT_ID:\s*\$\{\{\s*secrets\.INFISICAL_NEXT_CLIENT_ID\s*\}\}/);
  assert.match(workflow,/INFISICAL_REVOKED_CLIENT_ID:\s*\$\{\{\s*secrets\.INFISICAL_CLIENT_ID\s*\}\}/);
  assert.doesNotMatch(workflow,/secrets\.INFISICAL_REVOKED_CLIENT_SECRET/);
});

test('push-driven evidence ingestion pins verified runs and never qualifies Infisical',()=>{
  const workflow=read('../../.github/workflows/provider-wave2-infisical-evidence-ingest.yml');
  assert.match(workflow,/provider-wave2-infisical-evidence-ingest\.trigger/);
  assert.match(workflow,/37786884419/);
  assert.match(workflow,/37785525495/);
  assert.match(workflow,/github\.event_name == 'workflow_dispatch' && inputs\.qualify \|\| false/);
  assert.match(workflow,/github\.event_name == 'workflow_dispatch' && inputs\.owner_approval_ref \|\| ''/);
  assert.match(workflow,/Unsafe push-driven qualification attempt/);
  assert.match(workflow,/Verify successful source workflow runs/);
  assert.doesNotMatch(workflow,/INFISICAL_CLIENT_SECRET/);
});

test('Infisical evidence-only key preserves Cloudflare primary and restricts provider and operation',()=>{
  const sql=read('../../supabase/migrations/20261008142200_infisical_evidence_only_key.sql');
  assert.match(sql,/credential_id = 'cloudflare-primary'/);
  assert.match(sql,/credential_id = 'github-infisical-evidence-only'/);
  assert.match(sql,/p_provider_id IS DISTINCT FROM 'infisical'/);
  assert.match(sql,/coalesce\(p_operation,''\) NOT IN \('providerStateGet','qualificationEvidenceList','qualificationEvidenceAppend'\)/);
  assert.match(sql,/coalesce\(p_evidence_class,''\) NOT IN \('automated','live'\)/);
  assert.match(sql,/perform vaos_private\.assert_infisical_evidence_ingest_key\(p_server_key, v_provider_id, 'qualificationEvidenceAppend', v_evidence_class\)/);
  assert.match(sql,/perform vaos_private\.assert_infisical_evidence_ingest_key\(p_server_key, p_provider_id, 'qualificationEvidenceList'\)/);
  assert.match(sql,/perform vaos_private\.assert_infisical_evidence_ingest_key\(p_server_key, p_provider_id, 'providerStateGet'\)/);
  assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION public\.vaos_provider_state_put/);
  assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION vaos_private\.assert_server_key/);
  assert.doesNotMatch(sql,/INSERT INTO vaos_private\.server_credentials/);
});

test('every Infisical evidence SQL function is terminated before the next statement',()=>{
  const sql=read('../../supabase/migrations/20261008142200_infisical_evidence_only_key.sql');
  const starts=(sql.match(/CREATE OR REPLACE FUNCTION/g)||[]).length;
  const ends=(sql.match(/end;\r?\n\$function\$;/gi)||[]).length;
  assert.equal(starts,4);
  assert.equal(ends,starts);
  assert.doesNotMatch(sql,/end;\r?\n\$function\$\r?\n/i);
});
