import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../../supabase/migrations/20261008085000_provider_qualification_evidence_v1.sql',import.meta.url),'utf8');
const edge=fs.readFileSync(new URL('../../supabase/functions/vaos-control/index.ts',import.meta.url),'utf8');

test('qualification evidence migration creates append-only private table with RLS',()=>{
  assert.match(migration,/create table if not exists vaos_private\.provider_qualification_evidence/i);
  assert.match(migration,/enable row level security/i);
  assert.match(migration,/unique\(provider_id, capability, check_id, recorded_at, authority_ref\)/i);
  assert.match(migration,/outcome in \('pass','fail'\)/i);
  assert.match(migration,/evidence_class in \('automated','live','manual'\)/i);
});

test('qualification evidence RPCs require server-key assertion and are service-role only',()=>{
  for(const fn of ['vaos_provider_qualification_evidence_append','vaos_provider_qualification_evidence_list']){
    assert.equal(migration.includes(`create or replace function public.${fn}`),true,fn);
    const start=migration.indexOf(`create or replace function public.${fn}`);
    const body=migration.slice(start,start+5000);
    assert.equal(body.includes('perform vaos_private.assert_server_key(p_server_key);'),true,fn);
  }
  assert.match(migration,/revoke all on function public\.vaos_provider_qualification_evidence_append\(text,jsonb\) from public, anon, authenticated/i);
  assert.match(migration,/grant execute on function public\.vaos_provider_qualification_evidence_append\(text,jsonb\) to service_role/i);
  assert.match(migration,/revoke all on function public\.vaos_provider_qualification_evidence_list\(text,text,text\) from public, anon, authenticated/i);
  assert.match(migration,/grant execute on function public\.vaos_provider_qualification_evidence_list\(text,text,text\) to service_role/i);
});

test('vaos-control routes qualification evidence operations to the dedicated RPCs',()=>{
  assert.match(edge,/operation === 'qualificationEvidenceAppend'/);
  assert.match(edge,/rpcName = 'vaos_provider_qualification_evidence_append'/);
  assert.match(edge,/operation === 'qualificationEvidenceList'/);
  assert.match(edge,/rpcName = 'vaos_provider_qualification_evidence_list'/);
});
