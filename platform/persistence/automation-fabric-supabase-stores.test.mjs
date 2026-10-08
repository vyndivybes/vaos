import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutomationFabricSupabaseStores } from './automation-fabric-supabase-stores.mjs';

function fakeFetch(resolver){
  const calls=[];
  const fetchImpl=async(url,init)=>{
    const body=JSON.parse(init.body);
    calls.push({url,init,body});
    const resolved=await resolver(body.operation,body.payload);
    return {
      ok:resolved.status===undefined||resolved.status<400,
      status:resolved.status??200,
      async json(){return resolved.body},
    };
  };
  return {calls,fetchImpl};
}

test('provider state store loads and saves through vaos-control',async()=>{
  const {calls,fetchImpl}=fakeFetch(async(operation,payload)=>{
    if(operation==='providerStateGet')return{body:payload.providerId==='n8n'?{providerId:'n8n',enabled:false}:null};
    if(operation==='providerStatePut')return{body:{outcome:'SAVED',state:payload.state}};
    throw new Error(operation);
  });
  const stores=createAutomationFabricSupabaseStores({url:'https://supabase.example.test',serverSecret:'server-key',fetchImpl});
  assert.equal((await stores.providerState.load('n8n')).providerId,'n8n');
  const saved=await stores.providerState.save({providerId:'n8n',enabled:false});
  assert.equal(saved.providerId,'n8n');
  assert.deepEqual(calls.map(x=>x.body.operation),['providerStateGet','providerStatePut']);
  assert.equal(calls[0].init.headers['x-vaos-server-key'],'server-key');
});

test('callback store maps create/get/atomic consume outcomes to gateway errors',async()=>{
  let consumed=false;
  const record={receiptRef:'r1',providerId:'zapier',executionJobId:'j1',intentId:'i1',actionKey:'a1',tokenHash:'h',issuedAt:'2026-10-08T00:00:00.000Z',expiresAt:'2026-10-08T00:05:00.000Z',consumedAt:null,status:null,evidence:null};
  const {fetchImpl}=fakeFetch(async(operation,payload)=>{
    if(operation==='callbackCreate')return{body:{outcome:'CREATED',record}};
    if(operation==='callbackGet')return{body:{...record,consumedAt:consumed?'2026-10-08T00:00:01.000Z':null,status:consumed?'succeeded':null,evidence:consumed?{ok:true}:null}};
    if(operation==='callbackConsumeOnce'){
      if(consumed)return{body:{outcome:'REPLAY'}};
      consumed=true;return{body:{outcome:'CONSUMED',record:{...record,consumedAt:payload.consumedAt,status:payload.status,evidence:payload.evidence}}};
    }
    throw new Error(operation);
  });
  const stores=createAutomationFabricSupabaseStores({url:'https://supabase.example.test',serverSecret:'server-key',fetchImpl});
  await stores.callbacks.create(record);
  assert.equal((await stores.callbacks.get('r1')).receiptRef,'r1');
  const first=await stores.callbacks.consumeOnce('r1',{tokenHash:'h',providerId:'zapier',executionJobId:'j1',intentId:'i1',actionKey:'a1',consumedAt:'2026-10-08T00:00:01.000Z',status:'succeeded',evidence:{ok:true}});
  assert.equal(first.status,'succeeded');
  await assert.rejects(()=>stores.callbacks.consumeOnce('r1',{tokenHash:'h',providerId:'zapier',executionJobId:'j1',intentId:'i1',actionKey:'a1',consumedAt:'2026-10-08T00:00:02.000Z',status:'succeeded',evidence:{}}),error=>error.code==='CALLBACK_RECEIPT_REPLAY');
});

test('reconciliation store preserves enqueue idempotency, lease claim and lease mismatch semantics',async()=>{
  const record={reconciliationId:'r1',identity:'p|c|j|i|run',state:'PENDING'};
  const {fetchImpl}=fakeFetch(async(operation,payload)=>{
    if(operation==='reconciliationEnqueue')return{body:{outcome:'CREATED',record}};
    if(operation==='reconciliationClaim')return{body:{...record,state:'LEASED',leaseToken:'lease-1',leasedBy:'worker-1'}};
    if(operation==='reconciliationSave'){
      if(payload.leaseToken!=='lease-1')return{body:{outcome:'LEASE_MISMATCH'}};
      return{body:{outcome:'SAVED',record:{...record,...payload.patch}}};
    }
    if(operation==='reconciliationGet')return{body:record};
    if(operation==='reconciliationList')return{body:[record]};
    throw new Error(operation);
  });
  const stores=createAutomationFabricSupabaseStores({url:'https://supabase.example.test',serverSecret:'server-key',fetchImpl});
  assert.equal((await stores.reconciliation.enqueue(record)).outcome,'CREATED');
  assert.equal((await stores.reconciliation.claim({now:'2026-10-08T00:00:00.000Z',workerId:'worker-1',leaseSeconds:120})).leaseToken,'lease-1');
  await assert.rejects(()=>stores.reconciliation.save('r1',{state:'SUCCEEDED'},{leaseToken:'wrong'}),error=>error.code==='RECONCILIATION_LEASE_MISMATCH');
  assert.equal((await stores.reconciliation.save('r1',{state:'SUCCEEDED'},{leaseToken:'lease-1'})).state,'SUCCEEDED');
  assert.equal((await stores.reconciliation.get('r1')).reconciliationId,'r1');
  assert.equal((await stores.reconciliation.list()).length,1);
});

test('control bridge failures surface safe machine-readable errors without server secret leakage',async()=>{
  const {fetchImpl}=fakeFetch(async()=>({status:500,body:{error:{code:'CONTROL_PLANE_FAILURE',detail:'server-key'}}}));
  const stores=createAutomationFabricSupabaseStores({url:'https://supabase.example.test',serverSecret:'server-key',fetchImpl});
  await assert.rejects(async()=>{try{await stores.providerState.load('n8n')}catch(error){
    assert.equal(error.code,'AUTOMATION_FABRIC_STORE_FAILED');
    assert.equal(error.message.includes('server-key'),false);
    throw error;
  }},/AUTOMATION_FABRIC_STORE_FAILED/);
});

test('invalid callback and reconciliation RPC outcomes fail closed',async()=>{
  const {fetchImpl}=fakeFetch(async(operation)=>{
    if(operation==='callbackConsumeOnce')return{body:{outcome:'CORRELATION_MISMATCH'}};
    if(operation==='reconciliationEnqueue')return{body:{outcome:'CONFLICT'}};
    throw new Error(operation);
  });
  const stores=createAutomationFabricSupabaseStores({url:'https://supabase.example.test',serverSecret:'server-key',fetchImpl});
  await assert.rejects(()=>stores.callbacks.consumeOnce('r1',{tokenHash:'h',providerId:'p',executionJobId:'j',intentId:'i',actionKey:'a',consumedAt:'2026-10-08T00:00:00.000Z',status:'succeeded',evidence:{}}),error=>error.code==='CALLBACK_CORRELATION_MISMATCH');
  await assert.rejects(()=>stores.reconciliation.enqueue({reconciliationId:'r1'}),error=>error.code==='RECONCILIATION_IDEMPOTENCY_CONFLICT');
});


test('qualification evidence store appends idempotently and lists ordered evidence',async()=>{
  const rows=[
    {providerId:'playwright',capability:'browser.automate',stage:'contract',checkId:'manifest-v2',outcome:'pass',evidenceClass:'automated',evidenceRefs:['ci:1'],authorityRef:'ci',recordedAt:'2026-10-08T00:00:00.000Z'},
  ];
  let appended=false;
  const {calls,fetchImpl}=fakeFetch(async(operation,payload)=>{
    if(operation==='qualificationEvidenceAppend'){
      appended=true;
      return{body:{outcome:'APPENDED',record:payload.record}};
    }
    if(operation==='qualificationEvidenceList')return{body:rows};
    throw new Error(operation);
  });
  const stores=createAutomationFabricSupabaseStores({url:'https://supabase.example.test',serverSecret:'server-key',fetchImpl});
  const saved=await stores.qualificationEvidence.append(rows[0]);
  assert.equal(saved.checkId,'manifest-v2');
  assert.equal(appended,true);
  assert.deepEqual(await stores.qualificationEvidence.list('playwright','browser.automate'),rows);
  assert.deepEqual(calls.map(x=>x.body.operation),['qualificationEvidenceAppend','qualificationEvidenceList']);
});

test('qualification evidence replay is accepted but invalid outcome fails closed',async()=>{
  const record={providerId:'playwright',capability:'browser.automate',stage:'contract',checkId:'manifest-v2',outcome:'pass',evidenceClass:'automated',evidenceRefs:['ci:1'],authorityRef:'ci',recordedAt:'2026-10-08T00:00:00.000Z'};
  let mode='REPLAY';
  const {fetchImpl}=fakeFetch(async operation=>{
    if(operation==='qualificationEvidenceAppend')return{body:{outcome:mode,record}};
    throw new Error(operation);
  });
  const stores=createAutomationFabricSupabaseStores({url:'https://supabase.example.test',serverSecret:'server-key',fetchImpl});
  assert.equal((await stores.qualificationEvidence.append(record)).checkId,'manifest-v2');
  mode='INVALID';
  await assert.rejects(()=>stores.qualificationEvidence.append(record),error=>error.code==='PROVIDER_QUALIFICATION_EVIDENCE_SAVE_FAILED');
});
