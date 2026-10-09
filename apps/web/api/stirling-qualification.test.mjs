import test from 'node:test';
import assert from 'node:assert/strict';
import {createStirlingQualificationHandler} from './stirling-qualification.mjs';
const req=(method)=>({url:'https://vaos.example/api/stirling-qualification/status',method,env:{}});
test('Stirling public status endpoint never starts transformations',async()=>{
 let called=0;
 const handler=createStirlingQualificationHandler({getEvidence:async()=>{called++;return{
  providerId:'stirling-pdf',status:'HOLD',reason:'STIRLING_NOT_EXECUTED',productionActivation:false}}});
 assert.equal((await handler(req('POST'))).status,405);
 const response=await handler(req('GET'));
 assert.equal(response.status,200);
 assert.equal((await response.json()).productionActivation,false);
 assert.equal(called,1);
});
test('Stirling status reader fails closed and returns no secrets',async()=>{
 const handler=createStirlingQualificationHandler({getEvidence:async()=>{throw Error('do not leak secret value')}});
 const response=await handler(req('GET'));
 assert.equal(response.status,503);
 const body=await response.text();
 assert.equal(body.includes('do not leak'),false);
 assert.equal(JSON.parse(body).status,'HOLD');
});
