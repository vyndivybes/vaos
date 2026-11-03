import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderRuntime } from '../../platform/execution/provider-runtime.mjs';
import { createInsightProviderFactories } from './provider-runtime-factories.mjs';

const config = {
 baseUrl:'https://vector.example.test',
 secretBindingRef:'secret:qdrant:tenant-one',
 resources:{engineering:{tenantId:'tenant-1',remoteId:'engineering',vectorDimensions:2,fields:['tenant_id','title']}}
};
const job={id:'job-101',intentId:'intent-101',tenantId:'tenant-1',actionType:'READ.INSIGHT',payload:{resourceKey:'engineering',vector:[0.1,0.2]}};
test('provider runtime routes only qualified read-only observations, never canonical business effects',async()=>{
 let authorized=true,requests=0,credentials=0;
 const factories=createInsightProviderFactories({
  configurations:{qdrant:config},
  credentialBroker:{async withCredential(_request,run){credentials++;return run({kind:'api-key',value:'private-test-key'})}},
  transportFactory:({allowedOrigins,providerId})=>{
   assert.deepEqual(allowedOrigins,['https://vector.example.test']);
   assert.equal(providerId,'qdrant');
   return {async request(req){requests++;assert.equal(req.method,'POST');return{status:200,body:{result:{points:[{payload:{tenant_id:'tenant-1',title:'Engineering spec'}}]}}}}};
  },
 });
 const audits=[];
 const runtime=createProviderRuntime({
  controlPlane:{resolve(capability){return authorized&&capability==='search.semantic'?{providerId:'qdrant'}:null}},
  adapterFactories:factories,
  recordAudit:async event=>{audits.push(event)}
 });
 const result=await runtime.execute({capability:'search.semantic',dataClassification:'internal',riskClass:'low',executionJob:job});
 assert.equal(result.status,'OBSERVED');
 assert.equal(result.verification.verified,true);
 assert.equal(result.verification.independentlyVerified,false);
 assert.equal(result.canonicalStateUpdated,false);
 assert.equal(result.effect?.canonicalStateUpdated,false);
 assert.equal(result.records[0].tenant_id,'tenant-1');
 assert.equal(requests,1);
 assert.equal(credentials,1);
 assert.equal(audits.length,1);
 authorized=false;
 await assert.rejects(()=>runtime.execute({capability:'search.semantic',dataClassification:'internal',riskClass:'low',executionJob:job}),/PROVIDER_RUNTIME_NOT_AVAILABLE/);
 assert.equal(requests,1);
 assert.equal(credentials,1);
});
test('unknown configured providers cannot bypass candidate-only admission',()=>{
 assert.throws(()=>createInsightProviderFactories({configurations:{apromore:config},credentialBroker:{withCredential(){}}}),/INSIGHT_FACTORY_PROVIDER_INVALID/);
 assert.throws(()=>createInsightProviderFactories({configurations:{'great-expectations':config},credentialBroker:{withCredential(){}}}),/INSIGHT_FACTORY_PROVIDER_INVALID/);
});
test('runtime provider gate is scoped to selected provider and read-only capability',async()=>{
 let called=0;
 const factories=createInsightProviderFactories({configurations:{qdrant:config},credentialBroker:{async withCredential(){called++;throw Error('should not request secret')}},transportFactory:()=>({async request(){called++}})});
 const runtime=createProviderRuntime({controlPlane:{resolve(){return{providerId:'qdrant'}}},adapterFactories:factories});
 await assert.rejects(()=>runtime.execute({capability:'search.fulltext',dataClassification:'internal',riskClass:'low',executionJob:job}),/PROVIDER_NOT_QUALIFIED|PROVIDER_RUNTIME_ADAPTER_MISMATCH|PROVIDER_RUNTIME_NOT_AVAILABLE/);
 assert.equal(called,0);
});
