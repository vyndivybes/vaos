import test from 'node:test';import assert from 'node:assert/strict';
import {createSessionToken,SESSION_COOKIE} from '../lib/auth.mjs';
import {createVoiceCommercialHandler,summarizeCommercialRecords} from './voice-commercial.mjs';
import {DEFAULT_API_HANDLERS} from '../cloudflare-worker.mjs';
function out(){const state={code:200,data:null};const res={setHeader(){return res},status(n){state.code=n;return res},json(v){state.data=v;return res}};return {state,res};}
function req({email='shyamsundhar1982@gmail.com',flag='founder-readonly-v1',method='GET'}={}){return {method,headers:{cookie:email?SESSION_COOKIE+'='+createSessionToken(email):''},env:{VAOS_VOICE_CONTROL:'founder-readonly-browser-v1',VAOS_VOICE_COMMERCIAL_CONTROL:flag}};}
test('commercial voice route exists and is founder-only, explicit flag and GET',async()=>{
 assert.equal(typeof DEFAULT_API_HANDLERS['/api/voice-commercial'],'function');
 let calls=0;const handler=createVoiceCommercialHandler({getReader:()=>{calls++;return {execute:async()=>({})}}});
 for(const input of [{email:''},{email:'user@example.com'},{flag:'off'},{method:'POST'}]){
  const {state,res}=out();await handler(req(input),res);assert.notEqual(state.code,200);
 }
 assert.equal(calls,0);
});
test('bounded sales-order read does not infer revenue, and flags pagination',()=>{
 const record={actionType:'COMMERCIAL.OBSERVE_PIPELINE',sourceAuthority:'listSalesOrders',data:{records:[{status:'lead'},{status:'confirmed'}]}};
 const answer=summarizeCommercialRecords(record);
 assert.equal(answer.counts.confirmed,1);assert.equal(answer.complete,false);
 assert.match(answer.answer,/not verified collected revenue/);
 assert.throws(()=>summarizeCommercialRecords({...record,data:{}}));
 assert.throws(()=>summarizeCommercialRecords({...record,sourceAuthority:'other'}));
});
test('authorized signed read uses commercial action and safe response',async()=>{
 let called;const handler=createVoiceCommercialHandler({getReader:()=>({execute:async job=>{called=job;return {actionType:'COMMERCIAL.OBSERVE_PIPELINE',sourceAuthority:'listSalesOrders',data:{records:[{status:'confirmed'}]}};}})});
 const {state,res}=out();await handler(req(),res);
 assert.equal(state.code,200);assert.equal(called.actionType,'COMMERCIAL.OBSERVE_PIPELINE');
 assert.equal(state.data.data.counts.confirmed,1);
 assert.equal(state.data.data.actionAuthorized,false);
});
test('unknown schema fails closed with 503, not invented zero sales',async()=>{
 const handler=createVoiceCommercialHandler({getReader:()=>({execute:async()=>({actionType:'COMMERCIAL.OBSERVE_PIPELINE',sourceAuthority:'listSalesOrders',data:{unrecognized:true}})})});
 const {state,res}=out();await handler(req(),res);assert.equal(state.code,503);assert.equal(JSON.stringify(state.data).includes('zero sales'),false);
});
