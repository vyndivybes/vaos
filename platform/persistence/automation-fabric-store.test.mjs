import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseAutomationFabricStore } from './automation-fabric-store.mjs';

function fakeFetch(handler){
  const calls=[];
  return {
    calls,
    fetchImpl: async (url,init)=>{
      const body=JSON.parse(init.body);
      calls.push({url,init,body});
      const result=await handler(body);
      return {
        ok: result.status===undefined || (result.status>=200 && result.status<300),
        status: result.status ?? 200,
        async json(){ return result.body; },
      };
    },
  };
}

test('provider state load/save use vaos-control without exposing server secret in payload', async()=>{
  const fx=fakeFetch(async ({operation,payload})=>{
    if(operation==='providerStateGet') return {body:{providerId:payload.providerId,enabled:false}};
    if(operation==='providerStatePut') return {body:{outcome:'SAVED',state:payload.state}};
    throw new Error('unexpected');
  });
  const store=createSupabaseAutomationFabricStore({
    url:'https://supabase.example',
    serverSecret:'server-secret',
    fetchImpl:fx.fetchImpl,
  });
  const state=await store.providerState.load('n8n');
  assert.equal(state.providerId,'n8n');
  await store.providerState.save({providerId:'n8n',enabled:false});
  assert.equal(fx.calls[0].init.headers['x-vaos-server-key'],'server-secret');
  assert.equal(JSON.stringify(fx.calls.map(x=>x.body)).includes('server-secret'),false);
});

test('callback receipt adapter maps atomic provider outcomes to domain errors', async()=>{
  const outcomes=['REPLAY','TOKEN_INVALID','CORRELATION_MISMATCH','EXPIRED','NOT_FOUND'];
  const expected={
    REPLAY:'CALLBACK_RECEIPT_REPLAY',
    TOKEN_INVALID:'CALLBACK_TOKEN_INVALID',
    CORRELATION_MISMATCH:'CALLBACK_CORRELATION_MISMATCH',
    EXPIRED:'CALLBACK_RECEIPT_EXPIRED',
    NOT_FOUND:'CALLBACK_RECEIPT_NOT_FOUND',
  };
  for(const outcome of outcomes){
    const fx=fakeFetch(async ({operation})=>{
      if(operation==='callbackConsumeOnce') return {body:{outcome}};
      if(operation==='callbackGet') return {body:null};
      return {body:{outcome:'CREATED'}};
    });
    const store=createSupabaseAutomationFabricStore({
      url:'https://supabase.example',serverSecret:'s',fetchImpl:fx.fetchImpl,
    });
    await assert.rejects(
      ()=>store.callbackReceipts.consumeOnce('r1',{
        tokenHash:'hash',providerId:'zapier',executionJobId:'j',intentId:'i',actionKey:'a',
        consumedAt:'2026-10-08T00:00:00.000Z',status:'succeeded',evidence:{},
      }),
      new RegExp(expected[outcome]),
    );
  }
});

test('callback receipt create/get/consume preserve exactly-once interface', async()=>{
  const record={
    receiptRef:'r1',providerId:'zapier',executionJobId:'j',intentId:'i',actionKey:'a',
    tokenHash:'hash',issuedAt:'2026-10-08T00:00:00.000Z',expiresAt:'2026-10-08T00:05:00.000Z',
    consumedAt:null,status:null,evidence:null,
  };
  const fx=fakeFetch(async ({operation,payload})=>{
    if(operation==='callbackCreate') return {body:{outcome:'CREATED',record:payload.record}};
    if(operation==='callbackGet') return {body:record};
    if(operation==='callbackConsumeOnce') return {body:{outcome:'CONSUMED',record:{...record,consumedAt:payload.consumedAt,status:payload.status,evidence:payload.evidence}}};
    throw new Error('unexpected');
  });
  const store=createSupabaseAutomationFabricStore({url:'https://supabase.example',serverSecret:'s',fetchImpl:fx.fetchImpl});
  const created=await store.callbackReceipts.create(record);
  assert.equal(created.receiptRef,'r1');
  assert.equal((await store.callbackReceipts.get('r1')).providerId,'zapier');
  const consumed=await store.callbackReceipts.consumeOnce('r1',{
    tokenHash:'hash',providerId:'zapier',executionJobId:'j',intentId:'i',actionKey:'a',
    consumedAt:'2026-10-08T00:00:01.000Z',status:'succeeded',evidence:{id:'CRM-1'},
  });
  assert.equal(consumed.status,'succeeded');
});

test('reconciliation adapter preserves enqueue, leased claim and lease-checked save semantics', async()=>{
  const fx=fakeFetch(async ({operation,payload})=>{
    if(operation==='reconciliationEnqueue') return {body:{outcome:'CREATED',record:payload.record}};
    if(operation==='reconciliationClaim') return {body:{reconciliationId:'r1',identity:'x',providerId:'zapier',capability:'integration.saas',executionJobId:'j',intentId:'i',providerRunId:'p',reasonCode:'UNKNOWN',evidenceRefs:[],state:'LEASED',attempts:0,nextAttemptAt:'2026-10-08T00:00:00.000Z',createdAt:'2026-10-08T00:00:00.000Z',updatedAt:'2026-10-08T00:00:00.000Z',errorType:null,leaseToken:'lease-1',leasedBy:payload.workerId,leaseExpiresAt:'2026-10-08T00:02:00.000Z'}};
    if(operation==='reconciliationSave') return {body:{outcome:'SAVED',record:{reconciliationId:payload.reconciliationId,...payload.patch}}};
    if(operation==='reconciliationGet') return {body:{reconciliationId:payload.reconciliationId,state:'PENDING'}};
    if(operation==='reconciliationList') return {body:[]};
    throw new Error('unexpected');
  });
  const store=createSupabaseAutomationFabricStore({url:'https://supabase.example',serverSecret:'s',fetchImpl:fx.fetchImpl});
  const record={reconciliationId:'r1',identity:'x',providerId:'zapier',capability:'integration.saas',executionJobId:'j',intentId:'i',providerRunId:'p',reasonCode:'UNKNOWN',evidenceRefs:[],state:'PENDING',attempts:0,nextAttemptAt:'2026-10-08T00:00:00.000Z',createdAt:'2026-10-08T00:00:00.000Z',updatedAt:'2026-10-08T00:00:00.000Z',errorType:null};
  assert.equal((await store.reconciliation.enqueue(record)).outcome,'CREATED');
  await store.reconciliation.claim({now:'2026-10-08T00:00:00.000Z',workerId:'w1',leaseSeconds:120});
  await store.reconciliation.save('r1',{state:'SUCCEEDED'},{leaseToken:'lease-1'});
  assert.equal((await store.reconciliation.get('r1')).reconciliationId,'r1');
  assert.deepEqual(await store.reconciliation.list(),[]);
  assert.equal(fx.calls.find(x=>x.body.operation==='reconciliationSave').body.payload.leaseToken,'lease-1');
});

test('reconciliation conflict and lease mismatch map to domain errors', async()=>{
  for(const [outcome,code] of [
    ['CONFLICT','RECONCILIATION_IDEMPOTENCY_CONFLICT'],
    ['LEASE_MISMATCH','RECONCILIATION_LEASE_MISMATCH'],
    ['NOT_FOUND','RECONCILIATION_NOT_FOUND'],
  ]){
    const fx=fakeFetch(async ({operation})=>{
      if(operation==='reconciliationEnqueue') return {body:{outcome}};
      if(operation==='reconciliationSave') return {body:{outcome}};
      return {body:null};
    });
    const store=createSupabaseAutomationFabricStore({url:'https://supabase.example',serverSecret:'s',fetchImpl:fx.fetchImpl});
    if(outcome==='CONFLICT'){
      await assert.rejects(()=>store.reconciliation.enqueue({reconciliationId:'r'}),new RegExp(code));
    }else{
      await assert.rejects(()=>store.reconciliation.save('r',{}, {leaseToken:'l'}),new RegExp(code));
    }
  }
});

test('edge failure is surfaced as safe storage error without response-body leakage', async()=>{
  const fx=fakeFetch(async ()=>({status:500,body:{error:{message:'Bearer provider-secret leaked'}}}));
  const store=createSupabaseAutomationFabricStore({url:'https://supabase.example',serverSecret:'s',fetchImpl:fx.fetchImpl});
  await assert.rejects(async()=>{
    try{await store.providerState.load('n8n')}
    catch(error){
      assert.equal(error.code,'AUTOMATION_FABRIC_STORE_EDGE_FAILED');
      assert.equal(error.message.includes('provider-secret'),false);
      throw error;
    }
  },/AUTOMATION_FABRIC_STORE_EDGE_FAILED/);
});
