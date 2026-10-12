import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareVyndiBridgeEnvelope,createVyndiWriteBridgeAdapter} from '../execution/vyndi-write-bridge.mjs';
import {createStage9IsolatedSandbox} from './stage9-p2p-isolated-sandbox.mjs';

const input={employeeId:'procurement',actionType:'PROCUREMENT.CREATE_PO',
 missionId:'VAOS-STAGE9-SYNTHETIC',intentId:'STAGE9-ISOLATED-001',
 idempotencyKey:'STAGE9-PO-ONE-ML',approvalRef:'SYNTHETIC-CHECKER-001',
 input:{model:'VYNDI Altitude',supplier:'SYNTHETIC_NOT_REAL',currency:'INR',materialStatus:'UNFROZEN',
  variants:[{size:'M',quantity:1,unitPricePaise:100},{size:'L',quantity:1,unitPricePaise:200}]}};
const envelope=()=>prepareVyndiBridgeEnvelope(structuredClone(input));
const expectCode=(code)=>(e)=>e?.code===code;
const progress=(sandbox)=>{
 const draft=sandbox.draft(envelope(),{maker:'maker',materialRevision:'CANDIDATE-ONLY'});
 const approved=sandbox.approve({id:draft.id,checker:'checker',approvalRef:input.approvalRef,expectedVersion:1});
 const received=sandbox.receive({id:draft.id,receiver:'receiver',receiptId:'SYNTHETIC-GRN-001',
  items:[{size:'M',quantity:1},{size:'L',quantity:1}],expectedVersion:2});
 return {draft,approved,received};
};

test('Stage 9 starts from one model with one M and one L as configuration, not ledgers',()=>{
 const s=createStage9IsolatedSandbox();
 const draft=s.draft(envelope(),{maker:'maker',materialRevision:'CANDIDATE-ONLY'});
 assert.equal(draft.state,'DRAFT');
 assert.deepEqual(draft.items.map(({size,quantity})=>[size,quantity]),[['M',1],['L',1]]);
 assert.equal(draft.model,'VYNDI Altitude');
 assert.equal(draft.sandbox,true);
 assert.match(draft.evidenceHash,/^[a-f0-9]{64}$/);
 assert.equal(draft.paymentAuthorized,false);
 assert.equal(draft.vyndiPosted,false);
});

test('Full synthetic draft/checker/receipt/QA/invoice is three-way matched but makes zero payments',()=>{
 const s=createStage9IsolatedSandbox(),{draft,approved,received}=progress(s);
 assert.equal(approved.state,'APPROVED');assert.equal(received.state,'RECEIVED_PENDING_QA');
 assert.throws(()=>s.invoice({id:draft.id,invoiceId:'INV-1',clerk:'invoice',
  items:[{size:'M',quantity:1,unitPricePaise:100},{size:'L',quantity:1,unitPricePaise:200}],
  expectedVersion:3}),expectCode('STAGE9_QA_REQUIRED'));
 const qa=s.acceptQa({id:draft.id,inspector:'qa',passed:true,expectedVersion:3});
 assert.equal(qa.state,'QA_ACCEPTED');
 const posted=s.invoice({id:draft.id,invoiceId:'SYNTHETIC-INV-001',clerk:'invoice',
  items:[{size:'M',quantity:1,unitPricePaise:100},{size:'L',quantity:1,unitPricePaise:200}],
  expectedVersion:4});
 assert.equal(posted.state,'INVOICE_MATCHED_NOT_POSTED');
 assert.equal(posted.invoiceTotalPaise,300);
 assert.equal(posted.paymentAuthorized,false);assert.equal(posted.vyndiPosted,false);
 assert.deepEqual(s.readback(draft.id),posted);
 assert.equal(s.audit().length,5);
});

test('Maker/checker separation, revision locking, QA HOLD, and price/quantity mismatch fail closed',()=>{
 const s=createStage9IsolatedSandbox();
 const d=s.draft(envelope(),{maker:'maker',materialRevision:'CANDIDATE-ONLY'});
 assert.throws(()=>s.approve({id:d.id,checker:'maker',approvalRef:input.approvalRef,expectedVersion:1}),expectCode('STAGE9_SOD_DENIED'));
 assert.throws(()=>s.approve({id:d.id,checker:'checker',approvalRef:input.approvalRef,expectedVersion:0}),expectCode('STAGE9_STALE_VERSION'));
 s.approve({id:d.id,checker:'checker',approvalRef:input.approvalRef,expectedVersion:1});
 assert.throws(()=>s.receive({id:d.id,receiver:'receiver',receiptId:'GRN-1',
  items:[{size:'M',quantity:2},{size:'L',quantity:1}],expectedVersion:2}),expectCode('STAGE9_RECEIPT_MISMATCH'));
 s.receive({id:d.id,receiver:'receiver',receiptId:'GRN-1',
  items:[{size:'M',quantity:1},{size:'L',quantity:1}],expectedVersion:2});
 const h=s.acceptQa({id:d.id,inspector:'qa',passed:false,expectedVersion:3});
 assert.equal(h.state,'HOLD_QA');
 assert.throws(()=>s.invoice({id:d.id,invoiceId:'INV-1',clerk:'invoice',items:[],expectedVersion:4}),expectCode('STAGE9_QA_REQUIRED'));
 const x=createStage9IsolatedSandbox(),y=progress(x);x.acceptQa({id:y.draft.id,inspector:'qa',passed:true,expectedVersion:3});
 assert.throws(()=>x.invoice({id:y.draft.id,invoiceId:'INV-2',clerk:'invoice',
 items:[{size:'M',quantity:1,unitPricePaise:101},{size:'L',quantity:1,unitPricePaise:200}],expectedVersion:4}),expectCode('STAGE9_THREE_WAY_MISMATCH'));
});

test('Conflicting idempotency replay, unknown outcomes and emergency disable never execute production effects',async()=>{
 let transportCalls=0;
 const bridge=createVyndiWriteBridgeAdapter({transport:async()=>{transportCalls++;return {ok:true}}});
 const env=envelope(),s=createStage9IsolatedSandbox();
 const first=s.draft(env,{maker:'maker',materialRevision:'CANDIDATE-ONLY'});
 assert.equal(s.draft(env,{maker:'maker',materialRevision:'CANDIDATE-ONLY'}).replay,true);
 const bad=prepareVyndiBridgeEnvelope({...input,input:{...input.input,
 variants:[{size:'M',quantity:2,unitPricePaise:100},{size:'L',quantity:1,unitPricePaise:200}]}});
 assert.throws(()=>s.draft(bad,{maker:'maker',materialRevision:'CANDIDATE-ONLY'}),expectCode('STAGE9_IDEMPOTENCY_CONFLICT'));
 s.holdUnknownOutcome({id:first.id,reason:'SYNTHETIC_UNKNOWN_RESULT'});
 assert.equal(s.readback(first.id).state,'HOLD_UNKNOWN_OUTCOME');
 assert.throws(()=>s.approve({id:first.id,checker:'checker',approvalRef:input.approvalRef,expectedVersion:2}),expectCode('STAGE9_HOLD'));
 s.emergencyDisable();
 assert.throws(()=>s.draft({...env,idempotencyKey:'NEW-KEY'},{maker:'maker',materialRevision:'CANDIDATE-ONLY'}),expectCode('STAGE9_KILL_SWITCH'));
 assert.equal(s.readback(first.id).paymentAuthorized,false);
 await assert.rejects(()=>bridge.execute(env),expectCode('VYNDI_WRITE_BRIDGE_NOT_COMMISSIONED'));
 assert.equal(transportCalls,0);
});

test('Sandbox refuses any production transport, released material claim or invalid supplier',()=>{
 assert.throws(()=>createStage9IsolatedSandbox({transport:async()=>{}}),expectCode('STAGE9_NETWORK_FORBIDDEN'));
 const s=createStage9IsolatedSandbox();
 assert.throws(()=>s.draft({...envelope(),executionEnabled:true},{maker:'maker',materialRevision:'CANDIDATE-ONLY'}),expectCode('STAGE9_SANDBOX_ENVELOPE_REQUIRED'));
 assert.throws(()=>s.draft(envelope(),{maker:'maker',materialRevision:'RELEASED'}),expectCode('STAGE9_CANDIDATE_MATERIAL_ONLY'));
 assert.throws(()=>s.draft({...envelope(),input:{...input.input,supplier:'REAL_SUPPLIER'}},{maker:'maker',materialRevision:'CANDIDATE-ONLY'}),expectCode('STAGE9_SYNTHETIC_SUPPLIER_ONLY'));
});
