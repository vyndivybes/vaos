import test from 'node:test';
import assert from 'node:assert/strict';
import { createDurableAutomationFabric } from './automation-fabric-runtime.mjs';

const provider={
  schemaVersion:'vaos.provider.v2',providerId:'n8n',displayName:'n8n',adapterVersion:'1.0.0',
  capabilities:['workflow.orchestrate'],deploymentModes:['self-hosted'],enabled:false,
  qualification:{state:'evaluation',qualifiedCapabilities:[],evidenceRefs:[],validUntil:null},
  routing:{dataClassifications:['internal'],riskClasses:['low'],licensingAllowed:true},
  security:{secretBinding:'required',dataEgress:'controlled',authModes:['api-key'],callbackVerification:'hmac'},
  execution:{idempotency:'hybrid',retrySemantics:'conditional',verificationStrategy:'provider-readback',healthProbe:'optional',rollbackMethod:'disable-provider'},
  operations:{retentionClass:'default',dataResidency:['IN'],costControl:'bounded'},
};

function durableStores(){
  return {
    providerState:{
      async load(){return{providerId:'n8n',enabled:true,capabilityEnabled:{'workflow.orchestrate':true},qualification:{state:'qualified',qualifiedCapabilities:['workflow.orchestrate'],restrictedCapabilities:[],evidenceRefs:['q'],validUntil:null},routingRestrictions:{disabledDataClassifications:[],disabledRiskClasses:[]},health:null}},
      async save(state){return state},
    },
    callbackReceipts:{async create(r){return r},async get(){return null},async consumeOnce(){throw new Error('unused')}},
    reconciliation:{async enqueue(r){return{outcome:'CREATED',record:r}},async claim(){return null},async save(){throw new Error('unused')},async get(){return null},async list(){return[]}},
  };
}

test('initialize restores durable provider state before routing',async()=>{
  const fabric=createDurableAutomationFabric({
    providers:[provider],stores:durableStores(),
    callback:{tokenFactory:()=> 'opaque-token',hashToken:async()=> 'digest',baseUrl:'https://vaos.example.test/cb'},
  });
  await fabric.initialize();
  assert.equal(fabric.controlPlane.resolve('workflow.orchestrate',{dataClassification:'internal',riskClass:'low',deploymentMode:'self-hosted',dataResidency:'IN'}).providerId,'n8n');
});

test('fabric execute is blocked before initialize',async()=>{
  const fabric=createDurableAutomationFabric({
    providers:[provider],stores:durableStores(),
    callback:{tokenFactory:()=> 'opaque-token',hashToken:async()=> 'digest',baseUrl:'https://vaos.example.test/cb'},
  });
  await assert.rejects(()=>fabric.execute({}),/AUTOMATION_FABRIC_NOT_INITIALIZED/);
});
