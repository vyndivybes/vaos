import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../../supabase/migrations/20261118210405_a01_po_evidence_recording_v1.sql',import.meta.url),'utf8');

test('A01 PO evidence remains scoped to one authorized procurement handoff',()=>{
  assert.match(sql,/v_a01_po\s*:=\s*\(/i);
  assert.match(sql,/v_handoff\.mission_id='JARVIS-A01-20261118'/);
  assert.match(sql,/v_handoff\.to_agent_id='procurement'/);
  assert.match(sql,/v_handoff\.requested_job='PROCUREMENT\.OBSERVE_OPEN_POS'/);
  assert.match(sql,/v_work\.action_type='PROCUREMENT\.OBSERVE_OPEN_POS'/);
  assert.match(sql,/v_work\.authority=5/);
  assert.match(sql,/v_work\.execution_mode='ANALYSE'/);
  assert.match(sql,/v_work\.human_approval_required=false/);
});
test('A01 PO evidence is an unverified, bounded signed read, never a write or source certification',()=>{
  assert.match(sql,/not v_a01_po/);
  assert.match(sql,/or v_a01_po then/i);
  assert.match(sql,/if v_a01_po and p_report->>'sourceAuthority' <> 'listOpenPurchaseOrders'/);
  assert.match(sql,/sourceCompletenessVerified/);
  assert.match(sql,/sourceRevisionVerified/);
  assert.match(sql,/businessEffectsExecuted/);
  assert.match(sql,/engineeringReleaseGranted/);
  assert.match(sql,/HANDOFF_EVIDENCE_REPORT_INVALID/);
  assert.doesNotMatch(sql,/PROCUREMENT\.CREATE_PO|FINANCE\.PREPARE_PAYMENT|PRODUCTION\.RELEASE_JOB/);
});
test('evidence is still service-key-gated, immutable, independently read back, and not public',()=>{
  assert.match(sql,/perform vaos_private\.assert_server_key\(p_server_key\)/);
  assert.match(sql,/security definer/i);
  assert.match(sql,/set search_path\s*(?:to|=)\s*''/i);
  assert.match(sql,/HANDOFF_EVIDENCE_OWNER_MISMATCH/);
  assert.match(sql,/HANDOFF_EVIDENCE_STATUS_INVALID/);
  assert.match(sql,/HANDOFF_VERSION_CONFLICT/);
  assert.match(sql,/report_sha256/);
  assert.match(sql,/revoke all on function public\.vaos_record_handoff_work_evidence\(/i);
  assert.match(sql,/to service_role/i);
  assert.doesNotMatch(sql,/update vaos_private|delete from vaos_private/i);
});
