import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validatePersistentGraph,readPersistentGraph} from './jarvis-persistent-graph.mjs';
import {createJarvisGraphHandler} from '../api/jarvis-authority-graph.mjs';
import {createSessionToken,SESSION_COOKIE} from './auth.mjs';
const hash='a'.repeat(64);
const fixture={schemaVersion:'G2B_AUTHORITY_GRAPH_V1',sourceSystem:'VAOS_GOVERNED_DIGITAL_THREAD',
 graphStorage:'POSTGRES_EXISTING_GOVERNED_LINKS',status:'OBSERVED',asOf:'2026-10-13T01:00:00Z',
 sourceDataFreshnessCertified:false,causalRelationshipsVerified:false,
 cryptographicSignatureVerified:false,sourceRecordVersionsVerified:false,
 eligibleLinkCount:1,heldLegacyLinkCount:2,
 links:[{id:'link:g2b:'+hash,source:'node:g2b:'+hash,
 target:'node:g2b:'+('b'.repeat(64)),sourceDomain:'PROJECT_RISK',
 targetDomain:'ENGINEERING_BASELINE',relationType:'DRIVES_CHANGE',
 createdAt:'2026-10-13T01:00:00Z',provenance:'LEASED_GOVERNED_SUCCESSFUL_JOB'}]};
test('G2b accepts only bounded authoritative, privacy-safe graph projections',()=>{
 const g=validatePersistentGraph(fixture);
 assert.equal(g.status,'OBSERVED');
 assert.equal(g.links.length,1);
 assert.equal(g.heldLegacyLinkCount,2);
 assert.equal(g.actionAuthorized,false);
 assert.equal(g.persistenceVerified,true);
 assert.equal(g.sourceDataFreshnessCertified,false);
});
test('G2b fails closed on forged provenance, nonallowlisted domains, direct UUID exposure, uncontrolled claims or oversize',()=>{
 const change=(x)=>({...fixture,...x});
 for(const x of [
  {sourceDataFreshnessCertified:true},
  {cryptographicSignatureVerified:true},
  {eligibleLinkCount:2},
  {sourceSystem:'INTERNET'},
  {links:[{...fixture.links[0],source:'node:g2b:private@vayushastr.com'}]},
  {links:[{...fixture.links[0],relationType:'AUTHORIZE_PAYMENT'}]},
  {links:Array.from({length:101},(_,i)=>({...fixture.links[0],id:'link:g2b:'+String(i).padStart(64,'0')}))},
  {links:[{...fixture.links[0],context:'do not trust'}]},
 ])assert.throws(()=>validatePersistentGraph(change(x)),/G2B_GRAPH_INVALID/);
});
test('G2b remote read calls only the existing authenticated control edge, never accepts arbitrary URL or leaks secret',async()=>{
 const calls=[];
 const graph=await readPersistentGraph({url:'https://jjzycduoujbmiegqfiud.supabase.co',serverSecret:'testing-secret',
  fetchImpl:async(url,opts)=>{calls.push({url,opts});return {ok:true,json:async()=>fixture};}});
 assert.equal(graph.links.length,1);assert.equal(calls.length,1);
 assert.equal(calls[0].url,'https://jjzycduoujbmiegqfiud.supabase.co/functions/v1/vaos-control');
 assert.equal(JSON.parse(calls[0].opts.body).operation,'jarvisAuthorityGraph');
 assert.equal(calls[0].opts.headers['x-vaos-server-key'],'testing-secret');
 assert.doesNotMatch(JSON.stringify(graph),/testing-secret|private@/);
 await assert.rejects(readPersistentGraph({url:'https://attacker.com',serverSecret:'secret'}),/G2B_CONFIG_HOLD/);
});
test('G2b read-only handler enforces founder session, GET-only, no open writes and safe unavailable response',async()=>{
 const r=()=>({method:'GET',url:'https://vaos.test/api/jarvis-authority-graph',
  headers:{cookie:SESSION_COOKIE+'='+createSessionToken('shyamsundhar1982@gmail.com')},
  env:{VAOS_VOICE_CONTROL:'founder-readonly-browser-v1',SUPABASE_URL:'https://project.supabase.co',VAOS_DB_RPC_SECRET:'key'}});
 const collect=()=>{const state={status:200,payload:null};const res={setHeader(){return res},status(n){state.status=n;return res},json(v){state.payload=v;return res}};return {state,res}};
 let calls=0;const handler=createJarvisGraphHandler({read:async()=>{calls++;return validatePersistentGraph(fixture)}});
 for(const [req,status] of [[{...r(),headers:{}},401],[{...r(),method:'POST'},405],
  [{...r(),env:{}},409]]){
  const {state,res}=collect();await handler(req,res);assert.equal(state.status,status);
 }
 assert.equal(calls,0);
 const {state,res}=collect();await handler(r(),res);
 assert.equal(state.status,200);assert.equal(state.payload.data.links.length,1);
 assert.equal(state.payload.data.actionAuthorized,false);assert.equal(calls,1);
 const fail=createJarvisGraphHandler({read:async()=>{throw Error('private-info@example.com')}});
 const c=collect();await fail(r(),c.res);
 assert.equal(c.state.status,503);assert.doesNotMatch(JSON.stringify(c.state.payload),/private-info/);
});
test('G2b SQL projection contains no raw context/creator, is identity-gated, lease-linked, bounded and read-only',async()=>{
 const sql=await readFile(new URL('../../../supabase/migrations/20261013093000_jarvis_g2b_authority_graph_v1.sql',import.meta.url),'utf8');
 assert.match(sql,/vaos_private\.assert_server_key\(p_server_key\)/);
 assert.match(sql,/security definer/i);
 assert.match(sql,/j\.status\s*=\s*'SUCCEEDED'/i);
 assert.match(sql,/execution_job_id/i);
 assert.match(sql,/limit 100/i);
 assert.match(sql,/revoke all on function public\.vaos_jarvis_graph_snapshot/i);
 assert.match(sql,/grant execute on function public\.vaos_jarvis_graph_snapshot\(text\) to service_role/i);
 assert.doesNotMatch(sql,/jsonb_build_object\([^;]*'context',\s*l\.context/is);
 assert.doesNotMatch(sql,/jsonb_build_object\([^;]*'createdBy',\s*l\.created_by/is);
});
