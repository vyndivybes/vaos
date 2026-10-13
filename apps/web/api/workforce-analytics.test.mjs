import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionToken,SESSION_COOKIE} from '../lib/auth.mjs';
import {createWorkforceAnalyticsHandler} from './workforce-analytics.mjs';
import {DEFAULT_API_HANDLERS} from '../cloudflare-worker.mjs';

const sample={schemaVersion:'VAOS_WORKFORCE_OVERVIEW_V1',observedAt:'2026-10-13T10:00:00Z',readOnly:true,employees:[]};
function req(method='GET',email='shyamsundhar1982@gmail.com',query=''){
 return {method,url:'https://vaos.example/api/workforce-analytics'+query,
 headers:{cookie:email?SESSION_COOKIE+'='+createSessionToken(email):''},env:{}};
}
function response(){
 const state={status:200,headers:{},body:null};
 const res={setHeader(k,v){state.headers[k]=v;return res},status(n){state.status=n;return res},json(v){state.body=v;return res}};
 return {res,state};
}
test('route exists and only signed-in founder may inspect the workforce',async()=>{
 assert.equal(typeof DEFAULT_API_HANDLERS['/api/workforce-analytics'],'function');
 const calls=[];
 const handler=createWorkforceAnalyticsHandler({getStore:()=>({founderWorkforceOverview:async email=>{calls.push(email);return sample;}})});
 for(const email of [null,'kaaviyam1519@gmail.com']){
  const {res,state}=response();await handler(req('GET',email),res);assert.equal(state.status,email?403:401);
 }
 assert.deepEqual(calls,[]);
 const {res,state}=response();await handler(req(),res);
 assert.equal(state.status,200);assert.equal(state.body.data.employees.length,16);
 assert.equal(state.headers['Cache-Control'],'no-store');assert.equal(state.body.data.actionAuthorized,false);
 assert.deepEqual(calls,['shyamsundhar1982@gmail.com']);
});
test('reject all writes, query manipulation and malformed source without leaking data',async()=>{
 const handler=createWorkforceAnalyticsHandler({getStore:()=>({founderWorkforceOverview:async()=>({source:'secret'})})});
 for(const [method,query,status] of [['POST','',405],['GET','?agentId=qa',422],['GET','',503]]){
  const {res,state}=response();await handler(req(method,'shyamsundhar1982@gmail.com',query),res);
  assert.equal(state.status,status);assert.doesNotMatch(JSON.stringify(state.body),/secret/);
 }
});
