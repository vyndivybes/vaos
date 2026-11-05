import test from 'node:test';
import assert from 'node:assert/strict';
import {createStirlingQualificationHandler} from './stirling-qualification.mjs';
import {createSessionToken,SESSION_COOKIE} from '../lib/auth.mjs';
const cookie=SESSION_COOKIE+'='+encodeURIComponent(createSessionToken('shyamsundhar1982@gmail.com'));
const req=(method)=>({url:'https://vaos.example/api/stirling-qualification/status',method,headers:{cookie},env:{}});
test('Stirling authenticated status endpoint never starts transformations',async()=>{
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

test('Stirling status endpoint rejects unauthenticated callers without reading evidence',async()=>{
 let called=0;
 const handler=createStirlingQualificationHandler({getEvidence:async()=>{called++;return{status:'PASS'}}});
 for(const headers of [undefined,{},{cookie:SESSION_COOKIE+'=forged.token'}]){
  const response=await handler({url:'https://vaos.example/api/stirling-qualification/status',method:'GET',headers,env:{}});
  assert.equal(response.status,401);
  assert.equal((await response.json()).error.code,'UNAUTHENTICATED');
 }
 assert.equal(called,0);
});
