import test from 'node:test';
import assert from 'node:assert/strict';
import { createInsightReadAdapter } from './read-only-adapters.mjs';
import { exportApromoreEventLog, ingestGXValidationEvidence } from './offline-evidence.mjs';

const caps={metabase:'analytics.bi',qdrant:'search.semantic',meilisearch:'search.fulltext',typesense:'search.fulltext'};
const available=(id)=>({get:(name)=>name===id?{providerId:id,enabled:true,qualification:{state:'qualified',qualifiedCapabilities:[caps[id]]}}:null});
const broker={async withCredential(request,run){return run({kind:request.providerId==='meilisearch'?'bearer':'api-key',value:'fixture-credential'})}};
const cfg=(id)=>({baseUrl:'https://search.example.test',secretBindingRef:'secret:insight:'+id,resources:{finance:{tenantId:'tenant-1',remoteId:id==='metabase'?7:'finance_1',...(id==='metabase'?{dedicatedTenant:true}:{}) ,fields:['title','tenant_id']}}});
const job=(query)=>({id:'job-11',intentId:'intent-11',tenantId:'tenant-1',actionType:'READ.INSIGHT',payload:{resourceKey:'finance',...(query||{})}});
const results={
 metabase:[{value:7,tenant_id:'tenant-1'}],
 qdrant:{result:{points:[{id:1,score:0.9,payload:{tenant_id:'tenant-1',title:'A'}}]}},
 meilisearch:{hits:[{tenant_id:'tenant-1',title:'A'}]},
 typesense:{hits:[{document:{tenant_id:'tenant-1',title:'A'}}]},
};
for(const id of Object.keys(caps)){
 test(id+' is read-only, pinned to approved resource, and returns noncanonical source observations',async()=>{
  const requests=[];
  const adapter=createInsightReadAdapter({providerId:id,capabilityRegistry:available(id),credentialBroker:broker,transport:{async request(req){requests.push(req);return{status:200,body:results[id]}}},config:cfg(id)});
  const observation=await adapter.execute(job(id==='qdrant'?{vector:[0.1,0.2]}:{query:'bike'}));
  assert.equal(requests.length,1);
  assert.equal(new URL(requests[0].url).origin,'https://search.example.test');
  assert.equal(observation.status,'OBSERVED');
  assert.equal(observation.canonicalStateUpdated,false);
  assert.equal(observation.verification.independentlyVerified,false);
  assert.equal(observation.records.length,1);
  assert.equal(JSON.stringify(observation).includes('fixture-credential'),false);
 });
 test(id+' denies unqualified provider and tenant or resource mismatch before network/secret access',async()=>{
  let touched=0;
  const transport={async request(){touched++;throw Error('network must not be used')}};
  const deniedBroker={async withCredential(){touched++;throw Error('broker must not be used')}};
  const disabled={get:()=>({providerId:id,enabled:false,qualification:{state:'evaluation',qualifiedCapabilities:[]}})};
  const bad=createInsightReadAdapter({providerId:id,capabilityRegistry:disabled,credentialBroker:deniedBroker,transport,config:cfg(id)});
  await assert.rejects(()=>bad.execute(job()),/PROVIDER_NOT_QUALIFIED/);
  const good=createInsightReadAdapter({providerId:id,capabilityRegistry:available(id),credentialBroker:deniedBroker,transport,config:cfg(id)});
  await assert.rejects(()=>good.execute({...job(),tenantId:'tenant-2'}),/TENANT_DENIED/);
  await assert.rejects(()=>good.execute({...job(),payload:{resourceKey:'unknown'}}),/RESOURCE_DENIED/);
  assert.equal(touched,0);
 });
}
test('Qdrant restricts vector dimensions and includes server-side tenant filter',async()=>{
 let payload;
 const a=createInsightReadAdapter({providerId:'qdrant',capabilityRegistry:available('qdrant'),credentialBroker:broker,transport:{async request(req){payload=req.body;return{status:200,body:results.qdrant}}},config:cfg('qdrant')});
 await assert.rejects(()=>a.execute(job({vector:[NaN]})),/QUERY_INVALID/);
 await a.execute(job({vector:[0.1,0.2]}));
 assert.equal(payload.filter.must[0].match.value,'tenant-1');
});
test('Meilisearch and Typesense enforce tenant filters and escape query values in URL/body',async()=>{
 for(const id of ['meilisearch','typesense']){
  let request;
  const a=createInsightReadAdapter({providerId:id,capabilityRegistry:available(id),credentialBroker:broker,transport:{async request(req){request=req;return{status:200,body:results[id]}}},config:cfg(id)});
  await a.execute(job({query:'x & y'}));
  if(id==='meilisearch')assert.equal(request.body.filter,'tenant_id = "tenant-1"');
  else {const u=new URL(request.url);assert.equal(u.searchParams.get('filter_by'),'tenant_id:=tenant-1');assert.equal(u.searchParams.get('q'),'x & y');}
 }
});
test('Metabase refuses shared-tenant cards without isolation contract',async()=>{
 const config=cfg('metabase');delete config.resources.finance.dedicatedTenant;
 assert.throws(()=>createInsightReadAdapter({providerId:'metabase',capabilityRegistry:available('metabase'),credentialBroker:broker,transport:{request(){}},config}),/TENANT_ISOLATION_REQUIRED/);
});
test('provider errors fail closed, not as successful business evidence',async()=>{
 const a=createInsightReadAdapter({providerId:'metabase',capabilityRegistry:available('metabase'),credentialBroker:broker,transport:{async request(){return{status:401,body:{}}}},config:cfg('metabase')});
 await assert.rejects(()=>a.execute(job()),/PROVIDER_HTTP_ERROR/);
});
test('Apromore export is CSV-only offline interoperability with bounded events and source hash',()=>{
 const hash='a'.repeat(64);
 const out=exportApromoreEventLog({tenantId:'tenant-1',sourceRef:'vyndi:events:1',sourceSha256:hash,events:[{caseId:'order-1',activity:'Raised',timestamp:'2026-11-01T12:00:00.000Z'}]});
 assert.equal(out.status,'OFFLINE_EXPORT');
 assert.match(out.csv,/case_id,activity,timestamp/);
 assert.equal(out.productionRoutingAuthorized,false);
 assert.throws(()=>exportApromoreEventLog({tenantId:'tenant-1',sourceRef:'x',sourceSha256:'bad',events:[]}),/EVIDENCE_INVALID/);
});
test('Great Expectations evidence is imported but not falsely marked independently verified',()=>{
 const out=ingestGXValidationEvidence({tenantId:'tenant-1',sourceRef:'vyndi:qa:1',sourceSha256:'b'.repeat(64),result:{success:false,statistics:{evaluated_expectations:4,successful_expectations:3}}});
 assert.equal(out.status,'OBSERVED_UNVERIFIED');
 assert.equal(out.success,false);
 assert.equal(out.verification.independentlyVerified,false);
 assert.throws(()=>ingestGXValidationEvidence({tenantId:'tenant-1',sourceRef:'vyndi',sourceSha256:'b'.repeat(64),result:{success:'yes'}}),/EVIDENCE_INVALID/);
});
