import test from 'node:test';import assert from 'node:assert/strict';
import {createSessionToken,SESSION_COOKIE} from '../lib/auth.mjs';
import {createVoiceInsightHandler} from './voice-insight.mjs';
import {DEFAULT_API_HANDLERS} from '../cloudflare-worker.mjs';
const response=()=>{const state={code:200,body:null,headers:{}};const res={
 setHeader(k,v){state.headers[k]=v;return res},status(n){state.code=n;return res},json(v){state.body=v;return res}
};return {state,res};};
const req=(q,{email='shyamsundhar1982@gmail.com',method='GET',enabled='founder-readonly-browser-v1'}={})=>({
 url:'https://vaos.example/api/voice-insight?q='+encodeURIComponent(q),method,
 headers:{cookie:email?SESSION_COOKIE+'='+createSessionToken(email):''},
 env:{VAOS_VOICE_CONTROL:enabled},
});
test('voice intelligence registered; no unauthorized signed reads without founder identity and enabled voice',async()=>{
 assert.equal(typeof DEFAULT_API_HANDLERS['/api/voice-insight'],'function');
 let calls=0;
 const h=createVoiceInsightHandler({getReader:()=>{calls++;return {execute:async()=>({})}}});
 for(const o of [{email:''},{email:'someone@example.com'},{method:'POST'},{enabled:'off'}]){
  const {state,res}=response();await h(req('sales orders',o),res);assert.notEqual(state.code,200);
 }
 assert.equal(calls,0);
});
test('sales, HR, finance and material-shortage questions call only their signed read contract',async()=>{
 for(const [q,action,data] of [
  ['How are sales orders?','COMMERCIAL.OBSERVE_PIPELINE',{records:[{status:'confirmed',units:2}]}],
  ['How many people?','PEOPLE.OBSERVE_WORKFORCE',{people:[{id:'P1',name:'Secret',salary:99000}],authority:[]}],
  ['How many finance journals?','FINANCE.OBSERVE_LEDGER',{ledger:[],journals:[{id:'J1',debit:10000}]}],
  ['How many material shortages?','PROCUREMENT.OBSERVE_SHORTAGE',{records:[{shortage_quantity:3,id:'M1'}]}],
 ]){
  const calls=[];
  const h=createVoiceInsightHandler({getReader:()=>({execute:async job=>{
   calls.push(job.actionType);
   return {actionType:job.actionType,sourceAuthority:{
    'COMMERCIAL.OBSERVE_PIPELINE':'listSalesOrders','PEOPLE.OBSERVE_WORKFORCE':'listPeopleOfficeAuthority',
    'FINANCE.OBSERVE_LEDGER':'getAccountingWorkbench','PROCUREMENT.OBSERVE_SHORTAGE':'getConfiguredDemandShortages'
   }[job.actionType],data};}})});
  const {state,res}=response();await h(req(q),res);
  assert.equal(state.code,200,q);
  assert.deepEqual(calls,[action],q);
  assert.equal(state.body.data.readOnly,true);
  assert.equal(state.body.data.actionAuthorized,false);
  assert.equal(state.body.data.status,'OBSERVED');
  assert.ok(!JSON.stringify(state.body).includes('Secret'));
  assert.ok(!JSON.stringify(state.body).includes('99000'));
 }
});
test('unsupported, CRM conversion and group profit answer transparently without doing unrelated reads',async()=>{
 let executed=0;
 const h=createVoiceInsightHandler({getReader:()=>({execute:async()=>{executed++;throw Error('must not call')}})});
 for(const q of ['What is our CRM lead conversion?','What is our group profit?','Approve supplier payment','What is your favorite movie?']){
  const {state,res}=response();await h(req(q),res);
  assert.equal(state.code,q.startsWith('Approve')?422:200,q);
  if(state.code===200){assert.equal(state.body.data.status,'HOLD');assert.ok(state.body.data.answer.length>35);}
 }
 assert.equal(executed,0);
});
test('bridge wrong authority, malformed rows and missing service cause HOLD with no raw exception or PII',async()=>{
 const reader={execute:async()=>({actionType:'INVENTORY.OBSERVE_STOCK',sourceAuthority:'wrong',data:{records:[{id:'n'}]}})};
 const h=createVoiceInsightHandler({getReader:()=>reader});
 const {state,res}=response();await h(req('What is our stock?'),res);
 assert.equal(state.code,200);assert.equal(state.body.data.status,'HOLD');
 assert.doesNotMatch(JSON.stringify(state.body),/wrong|stock shortage is zero/i);
});

test('signed read failure returns a stable non-sensitive diagnostic code',async()=>{
 const h=createVoiceInsightHandler({getReader:()=>({execute:async()=>{
  const e=new Error('signer unavailable');e.code='VYNDI_BRIDGE_SIGNER_REQUIRED';throw e;
 }})});
 const {state,res}=response();await h(req('Show inventory stock'),res);
 assert.equal(state.code,200);
 assert.equal(state.body.data.status,'HOLD');
 assert.equal(state.body.data.diagnosticCode,'VOICE_SIGNER_NOT_READY');
});
test('unknown source row shape reports a qualification failure',async()=>{
 const h=createVoiceInsightHandler({getReader:()=>({execute:async job=>({
  actionType:job.actionType,sourceAuthority:'getAuthoritativeInventory',data:{unrecognized:true}
 })})});
 const {state,res}=response();await h(req('What inventory items are there?'),res);
 assert.equal(state.code,200);
 assert.equal(state.body.data.diagnosticCode,'VOICE_SOURCE_SCHEMA');
});

test('G5 observed numerical answer carries exact source authority and selected-window metadata, never a fabricated audited total',async()=>{
 const h=createVoiceInsightHandler({getReader:()=>({execute:async job=>({
  actionType:job.actionType,sourceAuthority:'getAuthoritativeInventory',
  data:{records:[{id:'stock-a'},{id:'stock-b'}]},
 })})});
 const {state,res}=response();
 await h(req('How many stock items are recorded?'),res);
 assert.equal(state.code,200);
 assert.equal(state.body.data.status,'OBSERVED');
 assert.equal(state.body.data.sourceAuthority,'getAuthoritativeInventory');
 assert.equal(state.body.data.recordsObserved,2);
 assert.equal(state.body.data.sourceWindow,'BOUNDED_SELECTED_ROWS');
 assert.match(state.body.data.observedAt,/^\d{4}-\d\d-\d\dT/);
 assert.equal(state.body.data.dataCompleteness,'BOUNDED_SOURCE_WINDOW');
 assert.doesNotMatch(state.body.data.answer,/2 total stock items|certified inventory|all inventory is accounted for/i);
});
test('G5 HOLD never carries stale source authority, numeric observation metadata or a fabricated receipt',async()=>{
 const h=createVoiceInsightHandler({getReader:()=>({execute:async()=>{throw Error('unavailable');}})});
 const {state,res}=response();await h(req('What is our stock position?'),res);
 assert.equal(state.body.data.status,'HOLD');
 for(const key of ['recordsObserved','sourceWindow','observedAt','sourceAuthority'])assert.equal(state.body.data[key],undefined);
});


test('G5: read-only authorization questions explain limits and do not access payment or dispatch adapters',async()=>{
 let readerCalls=0,missionCalls=0;
 const h=createVoiceInsightHandler({
  getReader:()=>{readerCalls++;return {execute:async()=>{throw Error('DO_NOT_CALL')}};},
  getMissionSummary:async()=>{missionCalls++;throw Error('DO_NOT_CALL');}
 });
 const {state,res}=response();
 await h(req('Can you approve a supplier payment or release production by yourself? Explain your authorization limits.'),res);
 assert.equal(state.code,200);
 assert.equal(state.body.data.status,'OBSERVED');
 assert.equal(state.body.data.schemaVersion,'VAOS_GOVERNANCE_EXPLANATION_V1');
 assert.equal(state.body.data.actionAuthorized,false);
 assert.match(state.body.data.answer,/cannot (?:approve|execute)/i);
 assert.match(state.body.data.answer,/founder|authorized/i);
 assert.equal(readerCalls,0);assert.equal(missionCalls,0);
});

test('G5: mission Q&A reads protected real summary, not generic model HOLD',async()=>{
 const summary={
  schemaVersion:'VAOS_FOUNDER_MISSION_SUMMARY_V1',sourceAuthority:'vaos_founder_mission_answer_summary',
  sourceWindow:'LATEST_10_MISSIONS',totalMissions:1,
  missions:[{id:'mission-test1',status:'ACTIVE',workPackages:2,completedWorkPackages:1,
   blockedWorkPackages:0,unfinishedHandoffs:1,awaitingReview:0,failedHandoffs:0,
   latestUpdate:'2026-10-15T08:00:00Z'}],latestVerifiedWork:null,
 };
 let called=0;
 const h=createVoiceInsightHandler({
  getMissionSummary:async()=>{called++;return summary;},
  getReader:()=>{throw Error('unrelated business read');}
 });
 const {state,res}=response();
 await h(req('Which assigned missions remain unfinished and why?'),res);
 assert.equal(state.code,200);
 assert.equal(state.body.data.status,'OBSERVED');
 assert.equal(state.body.data.sourceSystem,'VAOS_MISSION_CONTROL');
 assert.match(state.body.data.answer,/mission-test1/);
 assert.equal(called,1);
});

test('G5: unavailable mission datastore does not generate fake completed mission histories',async()=>{
 const h=createVoiceInsightHandler({
  getMissionSummary:async()=>{throw Error('service unavailable with private info');}
 });
 const {state,res}=response();
 await h(req('What happened in the latest completed departmental mission?'),res);
 assert.equal(state.body.data.status,'HOLD');
 assert.doesNotMatch(JSON.stringify(state.body),/private info/);
});
