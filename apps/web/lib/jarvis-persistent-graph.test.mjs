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
 eligibleLinkCount:1,heldLegacyLinkCount:2,unprojectedLinkCount:2,
 links:[{id:'link:g2b:'+hash,source:'node:g2b:'+hash,
 target:'node:g2b:'+('b'.repeat(64)),sourceDomain:'PROJECT_RISK',
 targetDomain:'ENGINEERING_BASELINE',relationType:'DRIVES_CHANGE',
 createdAt:'2026-10-13T01:00:00Z',provenance:'LEASED_GOVERNED_SUCCESSFUL_JOB'}]};
test('G2b accepts only bounded authoritative, privacy-safe graph projections',()=>{
 const g=validatePersistentGraph(fixture);
 assert.equal(g.status,'OBSERVED');
 assert.equal(g.links.length,1);
 assert.equal(g.heldLegacyLinkCount,2);
 assert.equal(g.unprojectedLinkCount,2);
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

test('directed graph paths retain holds, reject contradictory node domains and never reverse links',async()=>{
 const {queryGraphPaths}=await import('./jarvis-graph-paths.mjs');
 const q={from:'PROJECT_RISK',to:'ENGINEERING_BASELINE'};
 const result=queryGraphPaths(fixture,q);
 assert.equal(result.paths.length,1);
 assert.equal(result.enterpriseGraphComplete,false);
 assert.equal(result.sourceRecordVersionsVerified,false);
 assert.equal(result.heldLegacyLinkCount,2);
 assert.equal(queryGraphPaths(fixture,{from:q.to,to:q.from}).status,'NO_PATH_OBSERVED');
 for(const from of ['ALL','private@example.com',q.to])assert.throws(()=>queryGraphPaths(fixture,{from,to:q.to}));
 const bad={...fixture,eligibleLinkCount:2,links:[...fixture.links,{...fixture.links[0],id:'link:g2b:'+('c'.repeat(64)),sourceDomain:'QA_CAPA'}]};
 assert.throws(()=>queryGraphPaths(bad,q));
});
test('graph traversal stops at four hops, avoids cycles and reports path truncation',async()=>{
 const {queryGraphPaths}=await import('./jarvis-graph-paths.mjs');
 const node=n=>'node:g2b:'+n.toString(16).padStart(64,'0');
 const edge=(n,a,b,sd,td)=>({...fixture.links[0],id:'link:g2b:'+n.toString(16).padStart(64,'0'),source:node(a),target:node(b),sourceDomain:sd,targetDomain:td});
 const snap=links=>({...fixture,eligibleLinkCount:links.length,links});
 const q={from:'QA_CAPA',to:'PROJECT_RISK'};
 const links=[edge(1,1,2,'QA_CAPA','ENGINEERING_BASELINE'),edge(2,2,1,'ENGINEERING_BASELINE','QA_CAPA'),edge(3,2,3,'ENGINEERING_BASELINE','PROJECT_RISK')];
 assert.equal(queryGraphPaths(snap(links),q).paths.length,1);
 const many=Array.from({length:11},(_,i)=>edge(i+1,1,i+2,'QA_CAPA','PROJECT_RISK'));
 const result=queryGraphPaths(snap(many),q);
 assert.equal(result.paths.length,10);assert.equal(result.pathLimitReached,true);assert.equal(result.boundedSearchComplete,false);
 const chain=Array.from({length:5},(_,i)=>edge(i+1,i+1,i+2,i===0?'QA_CAPA':'ENGINEERING_BASELINE',i===4?'PROJECT_RISK':'ENGINEERING_BASELINE'));
 assert.equal(queryGraphPaths(snap(chain),q).paths.length,0);
 const dense=[];let id=0;
 for(let a=2;a<=11;a++)dense.push(edge(++id,1,a,'QA_CAPA','ENGINEERING_BASELINE'));
 for(let a=2;a<=11;a++)for(let b=2;b<=11;b++)if(a!==b)dense.push(edge(++id,a,b,'ENGINEERING_BASELINE','ENGINEERING_BASELINE'));
 const bounded=queryGraphPaths(snap(dense),q);
 assert.equal(bounded.searchLimited,true);assert.equal(bounded.expansions,1000);
});
test('path handler rejects malformed queries before reading and preserves founder protection',async()=>{
 const request=url=>({method:'GET',url,headers:{cookie:SESSION_COOKIE+'='+createSessionToken('shyamsundhar1982@gmail.com')},env:{VAOS_VOICE_CONTROL:'founder-readonly-browser-v1',SUPABASE_URL:'https://project.supabase.co',VAOS_DB_RPC_SECRET:'key'}});
 let calls=0;const handler=createJarvisGraphHandler({read:async()=>{calls++;return validatePersistentGraph(fixture)}});
 const run=async req=>{const state={};const res={setHeader(){},status(n){state.status=n;return res},json(v){state.payload=v;return res}};await handler(req,res);return state};
 for(const query of ['mode=paths','mode=paths&from=ALL&to=QA_CAPA','mode=paths&from=QA_CAPA&to=PROJECT_RISK&approve=true','mode=paths&from=QA_CAPA&from=PROJECT_RISK&to=PROJECT_RISK'])assert.equal((await run(request('/api/jarvis-authority-graph?'+query))).status,400);
 assert.equal(calls,0);
 const url='/api/jarvis-authority-graph?mode=paths&from=PROJECT_RISK&to=ENGINEERING_BASELINE';
 assert.equal((await run({...request(url),headers:{}})).status,401);
 const result=await run(request(url));assert.equal(result.status,200);assert.equal(result.payload.data.paths.length,1);assert.equal(calls,1);
});
