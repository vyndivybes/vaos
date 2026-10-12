import test from 'node:test';
import assert from 'node:assert/strict';
import {readZapierQualificationEvidence} from './zapier-evidence.mjs';
function storage(records=[]){
 const map=new Map(records);
 return {map,async list({prefix}){return {objects:[...map.keys()].filter(x=>x.startsWith(prefix)).map(key=>({key}))}},
 async get(key){return map.has(key)?{async text(){return map.get(key)}}:null}};
}
const key='qualification/zapier/3bf28ba5-83a0-4ec5-b893-e4c50bec64af.json';
test('missing evidence is HOLD, never a successful Zap run',async()=>{
 const r=await readZapierQualificationEvidence({VAOS_ARTIFACTS:storage()});
 assert.equal(r.status,'HOLD');assert.equal(r.productionActivation,false);
 assert.equal(r.independentReadbackVerified,false);
});
test('Zapier HTTP acceptance alone is explicitly unverified',async()=>{
 const a=storage([[key,JSON.stringify({providerId:'zapier',status:'ACKNOWLEDGED_UNVERIFIED',providerStatus:200,
  independentReadbackVerified:false,callbackVerified:false})]]);
 const r=await readZapierQualificationEvidence({VAOS_ARTIFACTS:a});
 assert.equal(r.status,'HOLD');assert.equal(r.acknowledgmentVerified,true);
 assert.equal(r.independentReadbackVerified,false);
 assert.equal(r.actionAuthorized,false);
});
test('corrupt evidence never authorizes business execution',async()=>{
 const a=storage([[key,'not json']]);
 const r=await readZapierQualificationEvidence({VAOS_ARTIFACTS:a});
 assert.equal(r.status,'HOLD');assert.equal(r.productionActivation,false);
});
test('evidence reader never reads arbitrary keys or discloses hook secret',async()=>{
 const a=storage([[key,JSON.stringify({providerId:'zapier',status:'ACKNOWLEDGED_UNVERIFIED',
  reason:'https://hooks.zapier.com/hooks/catch/123/foo/'})]]);
 const r=await readZapierQualificationEvidence({VAOS_ARTIFACTS:a,ZAPIER_CATCH_HOOK_URL:'https://hooks.zapier.com/hooks/catch/123/foo/'});
 assert.equal(JSON.stringify(r).includes('hooks.zapier.com'),false);
 assert.equal(r.actionAuthorized,false);
});
