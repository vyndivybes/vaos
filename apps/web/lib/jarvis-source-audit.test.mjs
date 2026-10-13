import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateSourceAudit,readSourceAudit,verifyMetadataRoundTrip} from './jarvis-source-audit.mjs';
import {createJarvisSourceAuditHandler} from '../api/jarvis-source-audit.mjs';
import {createSessionToken,SESSION_COOKIE} from './auth.mjs';
const fixture={schemaVersion:'G2B_SOURCE_AUDIT_V1',scope:'GOVERNED_VAOS_DIGITAL_THREAD',
 checkedAt:'2026-10-13T02:00:00Z',totalLinkCount:8,qualifiedLinkCount:4,
 sourceEndpointJobsSucceeded:8,changedAfterLinkCount:0,missingSourceTimestamps:0,
 futureSourceTimestamps:0,legacyLinkCount:2,sourceVersionSignatureVerified:false,
 sourceDocumentVersionsIndependentlyVerified:false,fullDatabaseRecoveryQualified:false,
 semanticContradictionsResolved:false};
test('bounded source-authority audit discloses verification limits and unqualified relationships',()=>{
 const a=validateSourceAudit(fixture);
 assert.equal(a.status,'SOURCE_AUTHORITY_REVIEW_OPEN');
 assert.equal(a.unqualifiedLinkCount,4);
 assert.equal(a.qualifiedLinkCount,4);
 assert.equal(a.actionAuthorized,false);
 assert.equal(a.g2bFullyCommissioned,false);
 assert.equal(a.fullDatabaseRecoveryQualified,false);
});
test('fail closed for forged certification, invalid counts, hidden PII and extra fields',()=>{
 const check=c=>assert.throws(()=>validateSourceAudit({...fixture,...c}),/G2B_AUDIT_INVALID/);
 for(const c of [{sourceVersionSignatureVerified:true},{fullDatabaseRecoveryQualified:true},
  {sourceDocumentVersionsIndependentlyVerified:true},{semanticContradictionsResolved:true},
  {qualifiedLinkCount:9},{legacyLinkCount:9},{sourceEndpointJobsSucceeded:9},
  {changedAfterLinkCount:-1},{scope:'EXTERNAL_UNKNOWN'},
  {leakedEmail:'private@example.com'}])check(c);
});
test('isolated metadata-only backup/restore drill detects tampering and never claims DB recovery',async()=>{
 const projection={schemaVersion:'G2B_AUTHORITY_GRAPH_V1',links:[
  {id:'link:g2b:'+('a'.repeat(64)),source:'node:g2b:'+('b'.repeat(64)),
   target:'node:g2b:'+('c'.repeat(64)),relationType:'RELATED_TO',
   sourceDomain:'PROJECT_RISK',targetDomain:'ENGINEERING_BASELINE',
   createdAt:'2026-10-13T01:00:00Z',provenance:'LEASED_GOVERNED_SUCCESSFUL_JOB'}]};
 const proof=await verifyMetadataRoundTrip(projection);
 assert.equal(proof.status,'METADATA_ROUNDTRIP_PASS');
 assert.equal(proof.fullDatabaseRecoveryQualified,false);
 assert.equal(proof.businessDataRestored,false);
 assert.equal(proof.recordCount,1);
 await assert.rejects(verifyMetadataRoundTrip({...projection,links:[{...projection.links[0],rawEmail:'secret@example.com'}]}),/G2B_REPLAY_INVALID/);
 await assert.rejects(verifyMetadataRoundTrip({...projection,links:[{...projection.links[0],id:'bad'}]}),/G2B_REPLAY_INVALID/);
});
test('source audit server-only reads require fixed Supabase host, no writes and no secrets in output',async()=>{
 const calls=[];
 const result=await readSourceAudit({url:'https://jjzycduoujbmiegqfiud.supabase.co',
  serverSecret:'test-control-secret',fetchImpl:async(url,options)=>{
   calls.push({url,options});return {ok:true,json:async()=>fixture};}});
 assert.equal(result.totalLinkCount,8);
 assert.equal(calls[0].url,'https://jjzycduoujbmiegqfiud.supabase.co/functions/v1/vaos-control');
 assert.equal(JSON.parse(calls[0].options.body).operation,'jarvisSourceAudit');
 assert.doesNotMatch(JSON.stringify(result),/test-control-secret/);
 await assert.rejects(readSourceAudit({url:'https://evil.example',serverSecret:'fake'}),/G2B_AUDIT_CONFIG_HOLD/);
});
test('source-authority API blocks guests and writes; untrusted upstream exception is not exposed',async()=>{
 const request={url:'https://vaos.test/api/jarvis-source-audit',method:'GET',
  env:{VAOS_VOICE_CONTROL:'founder-readonly-browser-v1',SUPABASE_URL:'https://jjzycduoujbmiegqfiud.supabase.co',VAOS_DB_RPC_SECRET:'test-secret'},
  headers:{cookie:SESSION_COOKIE+'='+createSessionToken('shyamsundhar1982@gmail.com')}};
 const collector=()=>{const state={status:200,payload:null};const res={setHeader(){return res},status(x){state.status=x;return res},json(x){state.payload=x;return res}};return {state,res}};
 let calls=0;const handler=createJarvisSourceAuditHandler({read:async()=>{calls++;return validateSourceAudit(fixture)}});
 for(const [req,status] of [[{...request,headers:{}},401],[{...request,method:'POST'},405],[{...request,env:{}},409]]){
  const {state,res}=collector();await handler(req,res);assert.equal(state.status,status);
 }
 assert.equal(calls,0);
 const ok=collector();await handler(request,ok.res);assert.equal(ok.state.status,200);assert.equal(calls,1);
 const fail=createJarvisSourceAuditHandler({read:async()=>{throw Error('private-secret-email@example.com')}});
 const no=collector();await fail(request,no.res);assert.equal(no.state.status,503);
 assert.doesNotMatch(JSON.stringify(no.state.payload),/private-secret/);
});
test('source authority SQL applies authenticated key and only returns aggregate metrics',async()=>{
 const sql=await readFile(new URL('../../../supabase/migrations/20261013095500_jarvis_g2b_source_integrity_audit_v1.sql',import.meta.url),'utf8');
 assert.match(sql,/vaos_private\.assert_server_key\(p_server_key\)/);
 assert.match(sql,/security definer/i);
 assert.match(sql,/'sourceEndpointJobsSucceeded'/i);
 assert.match(sql,/updated_at/i);
 assert.match(sql,/revoke all on function public\.vaos_jarvis_source_audit/i);
 assert.match(sql,/grant execute on function public\.vaos_jarvis_source_audit\(text\) to service_role/i);
 assert.doesNotMatch(sql,/drop table|truncate table|insert into|update vaos_private|delete from vaos_private/i);
});
