import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runA03CanaryFromFounderClick,summarizeA03Canary,captureA03DurableEvidence} from './jarvis-a03-canary.mjs';
const read=path=>readFile(new URL(path,import.meta.url),'utf8');
const safe={
 schemaVersion:'VAOS_JARVIS_A03_SIGNED_READ_CANARY_V1',
 status:'BOUNDED_READ_COMPLETE',qualificationStatus:'HOLD',
 productionWriteAuthorized:false,agentDispatchAuthorized:false,
 businessWritesExecuted:0,actionAuthorized:false,
 independentBusinessFactsCertified:false,sourceCompletenessVerified:false,
 externalReadInvocations:3,
 sources:[
  {sourceKind:'inventory',status:'SIGNED_BOUNDED_OBSERVATION',sourceCount:1},
  {sourceKind:'shortages',status:'SIGNED_BOUNDED_OBSERVATION',sourceCount:0},
  {sourceKind:'purchaseOrders',status:'SIGNED_BOUNDED_OBSERVATION',sourceCount:47}
 ]};
test('A03 founder trial has one discoverable governed workspace, global theme and explicit confirmation',async()=>{
 const [html,nav]=await Promise.all([read('./jarvis-a03-canary.html'),read('./vaos-shell.mjs')]);
 assert.match(html,/data-vaos-header/);
 assert.match(html,/data-vaos-view="jarvis-a03-canary"/);
 assert.match(html,/href="\/vaos-shell.css"/);
 assert.match(html,/src="\/vaos-shell.mjs"/);
 assert.match(html,/src="\/jarvis-a03-canary.mjs"/);
 for(const id of ['a03-panel','a03-confirm','a03-run','a03-status','a03-sources','a03-qualification'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/type="checkbox"[^>]*id="a03-confirm"/);
 assert.match(html,/<button[^>]*id="a03-run"[^>]*disabled/);
 assert.match(html,/No purchase orders, stock, money or engineering releases/);
 assert.match(nav,/jarvis-a03-canary\.html/);
 assert.doesNotMatch(html,/<iframe\b/i);
});
test('A03 has no eager source requests and refuses unconfirmed browser execution',async()=>{
 let requests=0;
 await assert.rejects(runA03CanaryFromFounderClick({confirmed:false,fetcher:async()=>{requests++;}}),
  /A03_FOUNDER_CONFIRMATION_REQUIRED/);
 assert.equal(requests,0);
 const source=await read('./jarvis-a03-canary.mjs');
 assert.match(source,/addEventListener\('click'/);
 assert.doesNotMatch(source,/setInterval\(|setTimeout\(|sessionStorage|localStorage|new WebSocket/);
});
test('A03 uses only the same-origin founder-scoped POST and surfaces redacted audit metadata',async()=>{
 const requests=[];
 const result=await runA03CanaryFromFounderClick({confirmed:true,fetcher:async(...args)=>{
  requests.push(args);return {ok:true,json:async()=>({data:{...safe,sources:safe.sources.map((x,i)=>({...x,rawRows:[{sku:'PRIVATE-SKU-884'}],verifiedContentDigest:'b'.repeat(64)}))}})};
 }});
 assert.equal(requests.length,1);
 const [url,opts]=requests[0];
 assert.equal(url,'/api/jarvis-a03-read-canary');
 assert.equal(opts.method,'POST');
 assert.equal(opts.credentials,'same-origin');
 assert.equal(opts.cache,'no-store');
 assert.equal(opts.headers['Content-Type'],'application/json');
 assert.deepEqual(JSON.parse(opts.body),{operation:'VERIFY_SIGNED_SOURCE_READS',confirm:true});
 assert.equal(result.status,'BOUNDED_READ_COMPLETE');
 assert.equal(result.qualificationStatus,'HOLD');
 assert.equal(result.sources.length,3);
 assert.deepEqual(result.sources.map(s=>s.sourceCount),[1,0,47]);
 assert.equal(result.businessWriteCount,0);
 assert.ok(!JSON.stringify(result).includes('PRIVATE-'));
 assert.ok(!JSON.stringify(result).includes('verifiedContentDigest'));
 assert.equal(result.businessSourceAuthorityVerified,false);
});
test('A03 never turns a partial, malformed or unauthorized server response into a PASS',()=>{
 for(const extra of [
 {productionWriteAuthorized:true},
 {agentDispatchAuthorized:true},
 {actionAuthorized:true},
 {independentBusinessFactsCertified:true},
 {sourceCompletenessVerified:true},
 {businessWritesExecuted:1},
 {status:'PASS'},
 {qualificationStatus:'PASS'},
 {sources:[safe.sources[0],safe.sources[0],safe.sources[1]]},
 {sources:[safe.sources[0],safe.sources[1],{sourceKind:'purchaseOrders',status:'SIGNED_BOUNDED_OBSERVATION',sourceCount:-1}]}
 ]){
  const output=summarizeA03Canary({...safe,...extra});
  assert.equal(output.status,'HOLD');
  assert.equal(output.qualificationStatus,'HOLD');
  assert.deepEqual(output.sources,[]);
 }
});
test('A03 signed-read HOLD and all network failures remain HOLD with no private error disclosure',async()=>{
 const reply=summarizeA03Canary({...safe,status:'HOLD',externalReadInvocations:1,
  sources:[{sourceKind:'inventory',status:'HOLD',sourceCount:null},
   {sourceKind:'shortages',status:'NOT_ATTEMPTED',sourceCount:null},
   {sourceKind:'purchaseOrders',status:'NOT_ATTEMPTED',sourceCount:null}]});
 assert.equal(reply.status,'HOLD');
 assert.equal(reply.sources.length,3);
 const failed=await runA03CanaryFromFounderClick({confirmed:true,
  fetcher:async()=>{throw Error('PRIVATE-CREDENTIAL-SECRET')}});
 assert.equal(failed.status,'HOLD');
 assert.ok(!JSON.stringify(failed).includes('PRIVATE-CREDENTIAL-SECRET'));
 const rejected=await runA03CanaryFromFounderClick({confirmed:true,
  fetcher:async()=>({ok:false,status:403,json:async()=>({error:'PRIVATE-RECORD'})})});
 assert.equal(rejected.status,'HOLD');
 assert.ok(!JSON.stringify(rejected).includes('PRIVATE-RECORD'));
});

test('A03 explicit archive consent captures a FRESH server observation and independently reads it back without leaking private source data',async()=>{
 const sent=[];
 const receipt='2026-11-19/5bef0e3a-27bb-4df1-8530-9f64dfb8a5fa';
 const fetcher=async(url,options)=>{sent.push([url,options]);
  if(options?.method==='POST')return {ok:true,json:async()=>({data:{
   stored:true,receipt,status:'HOLD',boundedReadCompleted:true,
   actionAuthorized:false,productionWriteAuthorized:false,businessSourceAuthorityVerified:false
  }})};
  return {ok:true,json:async()=>({data:{
   receipt,integrityVerified:true,independentSignatureVerified:false,
   businessSourceAuthorityVerified:false,actionAuthorized:false,productionWriteAuthorized:false,
   evidence:{schemaVersion:'VAOS_JARVIS_A03_ARCHIVED_OBSERVATION_V1',
    status:'BOUNDED_READ_COMPLETE',qualificationStatus:'HOLD',
    sources:['inventory','shortages','purchaseOrders'].map((sourceKind,i)=>({
     sourceKind,status:'SIGNED_BOUNDED_OBSERVATION',sourceCount:[1,0,47][i],
     rawRows:[{sku:'PRIVATE-SKU-600'}],contentDigest:'f'.repeat(64)
    })) }
  }})};
 };
 const x=await captureA03DurableEvidence({confirmed:true,fetcher});
 assert.equal(x.status,'ARCHIVED_BOUNDED_OBSERVATION');
 assert.equal(x.qualificationStatus,'HOLD');
 assert.equal(x.integrityVerified,true);
 assert.equal(x.independentSignatureVerified,false);
 assert.equal(x.receipt,receipt);
 assert.deepEqual(x.sourceCounts,[1,0,47]);
 assert.ok(!JSON.stringify(x).includes('PRIVATE-'));
 assert.ok(!JSON.stringify(x).includes('contentDigest'));
 assert.equal(sent.length,2);
 assert.equal(sent[0][0],'/api/jarvis-a03-evidence');
 assert.equal(sent[0][1].method,'POST');
 assert.equal(sent[0][1].credentials,'same-origin');
 assert.deepEqual(JSON.parse(sent[0][1].body),{operation:'CAPTURE_FRESH_SIGNED_READ',confirm:true});
 assert.equal(sent[1][0],'/api/jarvis-a03-evidence?receipt='+encodeURIComponent(receipt));
 assert.equal(sent[1][1].method,'GET');
});
test('A03 archive never executes without consent, never invents success from a rejected capture, and has no page-load auto capture',async()=>{
 let calls=0;
 await assert.rejects(captureA03DurableEvidence({confirmed:false,fetcher:async()=>{calls++;}}),
  /A03_ARCHIVE_CONFIRMATION_REQUIRED/);
 assert.equal(calls,0);
 const bad=await captureA03DurableEvidence({confirmed:true,fetcher:async()=>{
  calls++;return {ok:false,status:409,json:async()=>({error:'PRIVATE_TOKEN'})};
 }});
 assert.equal(bad.status,'HOLD');
 assert.equal(bad.receipt,null);
 assert.equal(calls,1);
 assert.ok(!JSON.stringify(bad).includes('PRIVATE_TOKEN'));
 const html=await read('./jarvis-a03-canary.html');
 const js=await read('./jarvis-a03-canary.mjs');
 for(const id of ['a03-archive-confirm','a03-capture','a03-archive-status'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/id="a03-capture"[^>]*disabled/);
 assert.match(js,/addEventListener\('click'/);
 assert.doesNotMatch(js,/setInterval\(|localStorage|sessionStorage/);
});
