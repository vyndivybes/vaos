import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createVyndiWriteBridgeAdapter,prepareVyndiBridgeEnvelope} from '../execution/vyndi-write-bridge.mjs';
import {getVyndiBridgeReadiness} from '../../packages/contracts/vyndi-write-bridge.mjs';

const input={employeeId:'procurement',actionType:'PROCUREMENT.CREATE_PO',
 missionId:'VAYU-SYNTHETIC-2-FRAMES',intentId:'TEST-INTENT-20261011-01',
 idempotencyKey:'P2P-SANDBOX-SYNTHETIC-001',approvalRef:'CHECKER-SYNTHETIC-02',
 input:{model:'VYNDI Altitude',variants:[{size:'M',quantity:1},{size:'L',quantity:1}],
  supplier:'SANDBOX_ONLY',currency:'INR',materialStatus:'UNFROZEN'}};
function fixture(){
 const ledger=new Map();
 return {
  postSimulated(envelope,{maker,checker,outcomeUnknown=false}={}){
   if(envelope.executionEnabled!==false||envelope.actionType!=='PROCUREMENT.CREATE_PO')
    throw Error('SANDBOX_ONLY_PREPARE_ENVELOPE');
   if(!maker||!checker||maker===checker)throw Error('SEGREGATION_REQUIRED');
   if(envelope.approvalRef!=='CHECKER-SYNTHETIC-02')throw Error('APPROVAL_REFERENCE_REQUIRED');
   const id=envelope.idempotencyKey;
   const digest=crypto.createHash('sha256').update(JSON.stringify(envelope)).digest('hex');
   if(ledger.has(id)){
    const saved=ledger.get(id);
    if(saved.digest!==digest)throw Error('IDEMPOTENCY_CONFLICT');
    return {...saved, replay:true};
   }
   if(outcomeUnknown) return {status:'HOLD_UNKNOWN_OUTCOME',sandbox:true,retryAuthorized:false};
   const result={status:'SIMULATED_NOT_VYNDI_POSTED',sandbox:true,replay:false,
    canonId:'SYNTHETIC-PO-01',digest,items:envelope.input.variants};
   ledger.set(id,result);return result;
  },
  readback(key){return ledger.get(key)||null;}, count(){return ledger.size;}
 };
}
test('Stage 9 synthetic sandbox uses one model with M and L variants, never separate size ledgers',()=>{
 const env=prepareVyndiBridgeEnvelope(input);
 assert.equal(env.target.authority,'submitDraftPurchaseOrder');
 assert.equal(env.executionEnabled,false);
 assert.deepEqual(env.input.variants.map(x=>[x.size,x.quantity]),[['M',1],['L',1]]);
 assert.equal(getVyndiBridgeReadiness().writePrepared,15);
});
test('simulated draft->checker->posting/readback is in-memory only; real bridge always rejects write',async()=>{
 let liveTransportCalls=0;
 const bridge=createVyndiWriteBridgeAdapter({transport:async()=>{liveTransportCalls++;return {posted:true};}});
 const envelope=bridge.prepare(input),sandbox=fixture();
 assert.throws(()=>sandbox.postSimulated(envelope,{maker:'actor-1',checker:'actor-1'}),/SEGREGATION_REQUIRED/);
 const result=sandbox.postSimulated(envelope,{maker:'actor-1',checker:'actor-2'});
 assert.equal(result.status,'SIMULATED_NOT_VYNDI_POSTED');
 assert.equal(sandbox.readback(envelope.idempotencyKey).digest,result.digest);
 const replay=sandbox.postSimulated(envelope,{maker:'actor-1',checker:'actor-2'});
 assert.equal(replay.replay,true);assert.equal(sandbox.count(),1);
 await assert.rejects(()=>bridge.execute(envelope),e=>e.code==='VYNDI_WRITE_BRIDGE_NOT_COMMISSIONED');
 assert.equal(liveTransportCalls,0);
});
test('idempotency conflict is denied and unknown outcome is held without mutation',()=>{
 const sandbox=fixture(); const env=prepareVyndiBridgeEnvelope(input);
 const denied=sandbox.postSimulated(env,{maker:'maker',checker:'checker',outcomeUnknown:true});
 assert.equal(denied.status,'HOLD_UNKNOWN_OUTCOME');
 assert.equal(denied.retryAuthorized,false);assert.equal(sandbox.count(),0);
 const first=sandbox.postSimulated(env,{maker:'maker',checker:'checker'});
 assert.equal(first.sandbox,true);
 assert.throws(()=>sandbox.postSimulated(prepareVyndiBridgeEnvelope({...input,input:{...input.input,variants:[{size:'M',quantity:2}]}}),
  {maker:'maker',checker:'checker'}),/IDEMPOTENCY_CONFLICT/);
 assert.equal(sandbox.count(),1);
});
test('no canonical VYNDI goods receipt/invoice/payment authority in this sandbox',()=>{
 const bridge=createVyndiWriteBridgeAdapter();
 for(const actionType of ['INVENTORY.RECEIVE_GOODS','FINANCE.POST_SUPPLIER_INVOICE','FINANCE.POST_PAYMENT'])
 assert.throws(()=>bridge.prepare({...input,actionType}),e=>e.code==='VYNDI_BRIDGE_ROUTE_NOT_FOUND');
});
