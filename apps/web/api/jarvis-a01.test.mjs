import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileA01Sources,createA01SourceEvidence} from '../../../intelligence/jarvis-a01-reconciliation.mjs';
import {createJarvisA01Handler} from './jarvis-a01.mjs';
import {DEFAULT_API_HANDLERS} from '../cloudflare-worker.mjs';
import {assessJarvisA01A10, JARVIS_A01_A10_GATES} from '../../../intelligence/jarvis-a10-progression.mjs';

test('A01-A10 rejects advertised autonomy when independent source authority and verifier are missing',async()=>{
 const source={schemaVersion:'VAOS_JARVIS_A01_SOURCE_RECONCILIATION_V1',consistencyGate:'PASS',
  businessSourceAuthorityVerified:false,independentBusinessFactsCertified:false,
  sources:[
   {sourceKind:'inventory',consistency:'MATCHED',authoritativeRevisionVerified:false,sourceCompletenessVerified:false,records:[{sku:'PRIVATE-CARBON'}]},
   {sourceKind:'shortages',consistency:'MATCHED',authoritativeRevisionVerified:false,sourceCompletenessVerified:false},
   {sourceKind:'purchaseOrders',consistency:'MATCHED',authoritativeRevisionVerified:false,sourceCompletenessVerified:false}
  ]};
 const plan=await assessJarvisA01A10({a01:source,specialists:{status:'BOUNDED_EVIDENCE',sourceRevisionVerified:false}});
 assert.equal(plan.stages.length,10);
 assert.deepEqual(plan.stages.map(x=>x.id),JARVIS_A01_A10_GATES.map(x=>x.id));
 assert.equal(plan.stages[0].status,'HOLD');
 assert.equal(plan.stages[1].status,'HOLD');
 assert.equal(plan.stages[9].status,'HOLD');
 assert.equal(plan.a02Plan.status,'PREPARE_ONLY');
 assert.equal(plan.a02Plan.workPackages.length,3);
 assert.ok(plan.a02Plan.workPackages.every(x=>x.executionEnabled===false&&x.readOnly===true));
 assert.equal(plan.productionWriteAuthorized,false);
 assert.equal(plan.agentDispatchAuthorized,false);
 assert.ok(!JSON.stringify(plan).includes('PRIVATE-CARBON'));
});

test('A01-A10 ignores forged evidence despite a permissive verifier when source-of-record is unverified',async()=>{
 const a01={schemaVersion:'VAOS_JARVIS_A01_SOURCE_RECONCILIATION_V1',consistencyGate:'PASS',
  businessSourceAuthorityVerified:false,independentBusinessFactsCertified:false,
  sources:['inventory','shortages','purchaseOrders'].map(sourceKind=>({sourceKind,consistency:'MATCHED',authoritativeRevisionVerified:false,sourceCompletenessVerified:false}))};
 const reported=Object.fromEntries(JARVIS_A01_A10_GATES.map(g=>[g.id,{
  stageId:g.id,kind:g.proofKind,reviewer:'independent-qa',implementer:'developer',
  releaseSha:'a'.repeat(40),proofSha256:'b'.repeat(64),
  verifiedAt:'2026-11-18T21:00:00Z',expiresAt:'2026-11-20T21:00:00Z',
  negativeControlsPassed:true
 }]));
 const r=await assessJarvisA01A10({a01,specialists:{status:'BOUNDED_EVIDENCE',sourceRevisionVerified:false},
  attestations:reported,verifyEvidence:async()=>true,releaseSha:'a'.repeat(40),now:Date.parse('2026-11-19T00:00:00Z')});
 assert.equal(r.status,'HOLD');
 assert.ok(r.stages.every(g=>g.status==='HOLD'));
 assert.equal(r.stages[0].reason,'SOURCE_AUTHORITY_UNVERIFIED');
});

test('A01-A10 rejects malformed source layouts instead of self-certifying a stage',async()=>{
 await assert.rejects(assessJarvisA01A10({a01:{schemaVersion:'VAOS_JARVIS_A01_SOURCE_RECONCILIATION_V1',sources:[]}}),
  /JARVIS_PROGRESSION_SOURCE_INVALID/);
});


const NOW='2026-11-18T00:40:00.000Z';
const kinds=['inventory','shortages','purchaseOrders'];
const routes={
 inventory:['INVENTORY.OBSERVE_STOCK','getAuthoritativeInventory','vyndi_inventory_balance:all'],
 shortages:['PROCUREMENT.OBSERVE_SHORTAGE','getConfiguredDemandShortages','vyndi_live_job_card_requirements:released_in_progress_positive_shortage'],
 purchaseOrders:['PROCUREMENT.OBSERVE_OPEN_POS','listOpenPurchaseOrders','vyndi_purchase_orders:open_status_v1'],
};
const counts={inventory:1,shortages:0,purchaseOrders:47};
const digest=async source=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(
 JSON.stringify({records:[],sourceCount:counts[source],sourceKind:source,sourceScope:routes[source][2]})
))),x=>x.toString(16).padStart(2,'0')).join('');
async function snapshot(){
 const result={};
 for(const kind of kinds){
  const [actionType,sourceAuthority,sourceScope]=routes[kind];
  const data={schemaVersion:'VYNDI_ONTOLOGY_READ_RECEIPT_V1',sourceKind:kind,sourceScope,
    sourceCount:counts[kind],records:[],complete:counts[kind]===0,hasMore:counts[kind]>0,
    sourceRevision:await digest(kind),sourceRevisionAuthority:'CONTENT_DIGEST_ONLY',
    asOf:'2026-11-18T00:39:50.000Z',asOfAuthority:'EXTRACT_TIME_NOT_SOURCE_CHANGE_TIME',
    sourceCompletenessVerified:false,readOnly:true,actionAuthorized:false,productionWriteAuthorized:false};
  // Nonempty source records for real complete pages must be actual rows.
  if(counts[kind]>0){
   data.records=Array.from({length:counts[kind]},(_,i)=>({index:i,tag:'PRIVATE-SKU-DO-NOT-LEAK'}));
   data.complete=true;data.hasMore=false;
   const canonical=JSON.stringify({records:data.records,sourceCount:counts[kind],sourceKind:kind,sourceScope});
   data.sourceRevision=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical))),x=>x.toString(16).padStart(2,'0')).join('');
  }
  result[kind]={readOnly:true,actionAuthorized:false,productionWriteAuthorized:false,effectClass:'read',
   sourceReceiptChecked:true,sourceCompletenessVerified:false,actionType,sourceAuthority,data};
 }
 return result;
}
function health(){
 return {status:'HOLD',agentUsable:false,sourceCompletenessVerified:false,readOnly:true,
  actionAuthorized:false,productionWriteAuthorized:false,sources:kinds.map(sourceKind=>({
   sourceKind,status:'SOURCE_UNVERIFIED',reason:'SOURCE_REVISION_UNVERIFIED',
   observedCount:counts[sourceKind],projectionCount:counts[sourceKind],
   receiptAgeSeconds:15,sloSeconds:sourceKind==='purchaseOrders'?3600:900,
   lastExtractedAt:'2026-11-18T00:39:45.000Z'}))};
}
const capture=()=>{const x={status:200,headers:{},body:null};return{x,res:{
 setHeader(k,v){x.headers[k]=v;return this},status(s){x.status=s;return this},json(y){x.body=y;return this}}}};
const req=(args={})=>({method:args.method||'GET',
 url:'https://vaos.local/api/jarvis-a01'+(args.query||''),
 headers:{cookie:''},env:{VAOS_ONTOLOGY_SOURCE_CONTROL:args.control||'founder-readonly-v1'}});

test('A01 route registered with real Cloudflare router',()=>{
 assert.equal(typeof DEFAULT_API_HANDLERS['/api/jarvis-a01'],'function');
});
test('A01 compares six cryptographically checked signed reads to separate durable projection, without certifying authority',async()=>{
 const x=await snapshot(),calls=[];
 const h=createJarvisA01Handler({getSession:()=>({email:'shyamsundhar1982@gmail.com'}),
  getReader:()=>({execute:async job=>{calls.push(job);return structuredClone(x[Object.keys(routes).find(k=>routes[k][0]===job.actionType)]);}}),
  getHealth:async()=>health(),now:()=>Date.parse(NOW)});
 const {x:out,res}=capture();await h(req(),res);
 assert.equal(out.status,200);
 assert.equal(out.body.data.schemaVersion,'VAOS_JARVIS_A01_SOURCE_RECONCILIATION_V1');
 assert.equal(out.body.data.status,'HOLD');
 assert.equal(out.body.data.consistencyGate,'PASS');
 assert.equal(out.body.data.businessSourceAuthorityVerified,false);
 assert.equal(out.body.data.productionWriteAuthorized,false);
 assert.equal(out.body.data.autonomyProgression.stages.length,10);
 assert.equal(out.body.data.autonomyProgression.currentUnqualifiedStage,'A01');
 assert.equal(out.body.data.autonomyProgression.a02Plan.status,'PREPARE_ONLY');
 assert.equal(out.body.data.autonomyProgression.agentDispatchAuthorized,false);
 assert.equal(out.body.data.aiModelInvocations,0);
 assert.deepEqual(out.body.data.sources.map(x=>x.sourceKind),kinds);
 assert.ok(out.body.data.sources.every(x=>x.consistency==='MATCHED'&&x.authoritativeRevisionVerified===false));
 assert.ok(out.body.data.holds.includes('AUTHORITATIVE_DATABASE_REVISION_REQUIRED'));
 assert.equal(calls.length,10);
 assert.equal(out.body.data.specialistReview.status,'SOURCE_HOLD');
 assert.equal(out.body.data.specialistReview.productionWriteAuthorized,false);
 assert.ok(!JSON.stringify(out.body).includes('PRIVATE-SKU-DO-NOT-LEAK'));
 assert.equal(out.headers['Cache-Control'],'no-store');
});
test('A01 refuses stale source, tampered content, mismatched revisions, drift or incomplete page',async()=>{
 const original=await snapshot();
 for(const failure of ['TAMPER','CHANGE','INCOMPLETE','STALE','DRIFT']){
  const samples=structuredClone(original);const hlt=health();let reads=0;
  if(failure==='TAMPER')samples.inventory.data.records[0].index=999;
  if(failure==='INCOMPLETE'){samples.purchaseOrders.data.complete=false;samples.purchaseOrders.data.hasMore=true;}
  if(failure==='STALE')samples.inventory.data.asOf='2026-11-16T00:40:00.000Z';
  if(failure==='DRIFT')hlt.sources[0].projectionCount=2;
  const handler=createJarvisA01Handler({
   getSession:()=>({email:'shyamsundhar1982@gmail.com'}),
   getReader:()=>({execute:async job=>{
    const kind=Object.keys(routes).find(k=>routes[k][0]===job.actionType);
    reads++;
    const result=structuredClone(samples[kind]);
    if(failure==='CHANGE'&&kind==='inventory'&&reads>3){
     result.data.records[0].index=444;
     const json=JSON.stringify({records:result.data.records,sourceCount:result.data.sourceCount,
      sourceKind:kind,sourceScope:result.data.sourceScope});
     result.data.sourceRevision=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(json))),x=>x.toString(16).padStart(2,'0')).join('');
    }
    return result;
   }}),getHealth:async()=>hlt,now:()=>Date.parse(NOW)});
  const {x,res}=capture();await handler(req(),res);
  assert.equal(x.status,200,failure);
  assert.equal(x.body.data.status,'HOLD',failure);
  assert.equal(x.body.data.consistencyGate,'HOLD',failure);
  assert.equal(x.body.data.productionWriteAuthorized,false,failure);
 }
});
test('A01 is founder-only, flag-gated and rejects query parameters or mutation methods before any read',async()=>{
 let calls=0;
 for(const [session,args,status] of [
  [null,{},401],[{email:'other@example.org'},{},403],
  [{email:'shyamsundhar1982@gmail.com'},{control:'off'},409],
  [{email:'shyamsundhar1982@gmail.com'},{query:'?execute=true'},422],
  [{email:'shyamsundhar1982@gmail.com'},{method:'POST'},405],
 ]){
  const h=createJarvisA01Handler({getSession:()=>session,getReader:()=>{calls++;return {}},getHealth:async()=>health()});
  const {x,res}=capture();await h(req(args),res);assert.equal(x.status,status);
 }
 assert.equal(calls,0);
});
test('A01 fails closed on unavailable signed reader or missing durable comparison',async()=>{
 const samples=await snapshot();
 const handler=createJarvisA01Handler({getSession:()=>({email:'shyamsundhar1982@gmail.com'}),
  getReader:()=>({execute:async job=>{if(job.actionType==='INVENTORY.OBSERVE_STOCK')throw Error('private secret');return samples[Object.keys(routes).find(k=>routes[k][0]===job.actionType)]}}),
  getHealth:async()=>{throw Error('secret db')}});const {x,res}=capture();
 await handler(req(),res);assert.equal(x.status,503);
 assert.ok(!JSON.stringify(x.body).includes('private secret'));
});
test('pure A01 cannot promote content digest or health projection to independent source authority',async()=>{
 const samples=await snapshot();const sourceEvidence=createA01SourceEvidence(samples);
 const result=await reconcileA01Sources({first:sourceEvidence,second:sourceEvidence,health:health(),now:Date.parse(NOW)});
 assert.equal(result.businessSourceAuthorityVerified,false);
 assert.equal(result.canPrepareBusinessAction,false);
 assert.equal(result.status,'HOLD');
});

test('A01 skips cross-domain specialist reads when source consistency gate fails',async()=>{
 const originals=await snapshot();let calls=0, specialists=0;
 const h=createJarvisA01Handler({getSession:()=>({email:'shyamsundhar1982@gmail.com'}),
  getReader:()=>({execute:async job=>{
   calls++;const kind=Object.keys(routes).find(x=>routes[x][0]===job.actionType);
   const data=structuredClone(originals[kind]);
   if(kind==='inventory')data.data.sourceRevision='b'.repeat(64);
   return data;
  }}),getHealth:async()=>health(),now:()=>Date.parse(NOW),
  runSpecialists:async()=>{specialists++;throw Error('should not run');}});
 const {x,res}=capture();await h(req(),res);
 assert.equal(x.status,200);
 assert.equal(x.body.data.consistencyGate,'HOLD');
 assert.equal(x.body.data.specialistReview.status,'NOT_RUN_SOURCE_GATE_HOLD');
 assert.equal(specialists,0);
 assert.equal(calls,6);
});

test('A01-A10 gate controller can certify only sequential independently verified exact-SHA records',async()=>{
 const a01={schemaVersion:'VAOS_JARVIS_A01_SOURCE_RECONCILIATION_V1',consistencyGate:'PASS',
  businessSourceAuthorityVerified:true,independentBusinessFactsCertified:true,
  sources:['inventory','shortages','purchaseOrders'].map(sourceKind=>({sourceKind,consistency:'MATCHED',authoritativeRevisionVerified:true,sourceCompletenessVerified:true}))};
 const specialists={status:'BOUNDED_EVIDENCE',sourceRevisionVerified:true,completeDatasetVerified:true};
 const releaseSha='a'.repeat(40);
 const attestations=Object.fromEntries(JARVIS_A01_A10_GATES.map(g=>[g.id,{
  stageId:g.id,kind:g.proofKind,reviewer:'independent-qa',implementer:'developer',
  releaseSha,proofSha256:'b'.repeat(64),verifiedAt:'2026-11-18T21:00:00Z',
  expiresAt:'2026-11-20T21:00:00Z',negativeControlsPassed:true
 }]));
 const verified=await assessJarvisA01A10({a01,specialists,attestations,releaseSha,
  now:Date.parse('2026-11-19T00:00:00Z'),verifyEvidence:async r=>r.reviewer==='independent-qa'});
 assert.equal(verified.status,'QUALIFICATION_EVIDENCE_COMPLETE');
 assert.ok(verified.stages.every(g=>g.status==='PASS'));
 assert.equal(verified.productionWriteAuthorized,false);
 assert.equal(verified.executionAuthorityUnaffected,true);
 attestations.A05={...attestations.A05,proofSha256:'tampered'};
 const blocked=await assessJarvisA01A10({a01,specialists,attestations,releaseSha,
  now:Date.parse('2026-11-19T00:00:00Z'),verifyEvidence:async()=>true});
 assert.equal(blocked.stages.find(g=>g.id==='A05').status,'HOLD');
 assert.equal(blocked.stages.find(g=>g.id==='A10').reason,'PREVIOUS_STAGE_HOLD');
});
