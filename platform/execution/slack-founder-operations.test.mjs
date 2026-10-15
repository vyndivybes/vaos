import test from 'node:test';
import assert from 'node:assert/strict';
import {
 parseFounderProductionRequest,
 prepareFounderProductionIntake,
 readFounderProductionIntake,
 readFounderSlackContext,
 saveFounderSlackContext,
 isSlackContextFollowUp
} from './slack-founder-operations.mjs';

function store(){
 const data=new Map();
 return {data,
  async get(key){return data.has(key)?{text:async()=>data.get(key)}:null},
  async put(key,value,options={}){
   if(options.onlyIf?.get?.('If-None-Match')==='*'&&data.has(key))return null;
   data.set(key,value);return {etag:'local'};
  }
 };
}
const command='OK INFORM THE PRODUCTION FOR 1 MORE CONFIRMED DEMAND ORCER FOR 1 CARBON VYNDI ALTITUDE S FRAME BICYCLE';

test('recognize imperfect English founder production demand but never treat it as a confirmed sales order',()=>{
 const parsed=parseFounderProductionRequest(command);
 assert.equal(parsed?.kind,'PRODUCTION_DEMAND_INTAKE');
 assert.equal(parsed.quantity,1);
 assert.equal(parsed.model,'VYNDI Altitude');
 assert.equal(parsed.size,'S');
 assert.equal(parsed.material,'CARBON');
 assert.equal(parsed.claimedConfirmed,true);
 assert.equal(parsed.orderRef,null);
 assert.equal(parsed.productionReleaseAuthorized,false);
 assert.equal(parseFounderProductionRequest('JOB CARD STSTUS'),null);
 assert.equal(parseFounderProductionRequest('please release job card 45'),null);
 assert.equal(parseFounderProductionRequest('show supplier details'),null);
 assert.equal(parseFounderProductionRequest('inform production of 500 more bikes'),null);
});

test('founder DM intake saves exactly one durable pending draft with no business writes',async()=>{
 const r2=store(),env={VAOS_ARTIFACTS:r2};
 const requested=parseFounderProductionRequest(command);
 const ctx={kind:'dm',channel:'D0FOUNDER123',eventId:'EvTEST20261016A'};
 const first=await prepareFounderProductionIntake(requested,env,ctx);
 assert.equal(first.status,'PENDING_SOURCE_VALIDATION');
 assert.equal(first.actionAuthorized,false);
 assert.equal(first.orderCreated,false);
 assert.equal(first.productionNotified,false);
 assert.match(first.answer,/not.*confirmed|not.*created/i);
 assert.match(first.answer,/VYNDI Altitude/);
 const saved=await readFounderProductionIntake(env,first.requestId);
 assert.equal(saved.status,'PENDING_SOURCE_VALIDATION');
 assert.equal(saved.quantity,1);
 assert.equal(saved.salesOrderVerified,false);
 assert.equal(saved.productionReleaseAuthorized,false);
 assert.equal(Object.keys(saved).some(x=>/customer|payment|email/.test(x)),false);
 const again=await prepareFounderProductionIntake(requested,env,ctx);
 assert.equal(again.requestId,first.requestId);
 assert.equal(again.duplicate,true);
 assert.equal(r2.data.size,1);
});

test('unauthorized channel cannot create internal production intake',async()=>{
 const env={VAOS_ARTIFACTS:store()};
 const result=await prepareFounderProductionIntake(parseFounderProductionRequest(command),env,{kind:'mention',channel:'C0PUBLIC',eventId:'EvTESTNOTDM'});
 assert.equal(result.status,'HOLD');
 assert.equal(env.VAOS_ARTIFACTS.data.size,0);
});

test('save only compact founder context for private DMs; expire previous conversation',async()=>{
 const env={VAOS_ARTIFACTS:store()};
 await saveFounderSlackContext(env,{kind:'dm',channel:'D0FOUNDER123'},{
  route:'PRODUCTION',requestId:'EvTEST20261016A',at:1792095542739
 });
 const current=await readFounderSlackContext(env,{kind:'dm',channel:'D0FOUNDER123'},1792095542839);
 assert.deepEqual(current,{route:'PRODUCTION',requestId:'EvTEST20261016A'});
 assert.equal(await readFounderSlackContext(env,{kind:'dm',channel:'D0FOUNDER123'},1792095542739+2*86400000),null);
 assert.equal(await readFounderSlackContext(env,{kind:'mention',channel:'C0PUBLIC'},1792095542839),null);
 assert.equal(isSlackContextFollowUp('and its status?'),true);
 assert.equal(isSlackContextFollowUp('show supplier details'),false);
});
