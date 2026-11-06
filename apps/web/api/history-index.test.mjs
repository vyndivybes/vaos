import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionToken,SESSION_COOKIE} from '../lib/auth.mjs';
import {createHistoryIndexHandler} from './history-index.mjs';
import {DEFAULT_API_HANDLERS} from '../cloudflare-worker.mjs';

const origin='https://vaos.vayushastr.workers.dev';
const founder='shyamsundhar1982@gmail.com';
const fakeStore=()=>({
 async status(){return {status:'OBSERVED',sources:[],encrypted:true,readOnly:true}},
 async search(){return {matches:[],complete:true,actionAuthorized:false}},
 async read(){return null},
 async ingest(){return {added:1,updated:0,unchanged:0}},
 async progress(){return {cursor:null,complete:false}},
 async checkpoint(){return {complete:true,hasMore:false}},
 async purge(){return {deleted:1,remaining:0}},
});
const env={VAOS_HISTORY_INDEX_CONTROL:'founder-index-v1'};
const request=(path,method='GET',body=null,options={})=>({
 method,url:origin+'/api/history-index'+path,body,
 headers:{cookie:SESSION_COOKIE+'='+createSessionToken(options.email||founder),
  origin:options.origin===undefined?origin:options.origin,
  'content-type':options.contentType||'application/json'},
 env:{...env,...options.env}
});
function out(){const data={status:200,body:null};const res={setHeader(){return this},status(n){data.status=n;return this},
 json(v){data.body=v;return this}};return {res,data};}
async function run(handler,req){const {res,data}=out();await handler(req,res);return data;}
test('route is protected by founder authentication and commissioning flag',async()=>{
 assert.equal(typeof DEFAULT_API_HANDLERS['/api/history-index/status'],'function');
 const h=createHistoryIndexHandler({makeStore:fakeStore});
 assert.equal((await run(h,{...request('/status'),headers:{cookie:''}})).status,401);
 assert.equal((await run(h,request('/status','GET',null,{email:'other@example.com'}))).status,403);
 assert.equal((await run(h,request('/status','GET',null,{env:{VAOS_HISTORY_INDEX_CONTROL:'off'}}))).status,409);
 assert.equal((await run(h,request('/unknown'))).status,404);
});
test('mutation is founder plus same-origin gated and fails closed',async()=>{
 const h=createHistoryIndexHandler({makeStore:fakeStore});
 const body={source:'chatgpt',records:[{id:'c',title:'T',body:'x'}]};
 assert.equal((await run(h,request('/ingest','POST',body,{origin:'https://evil.example'}))).status,403);
 assert.equal((await run(h,request('/ingest','POST',body,{contentType:'text/plain'}))).status,415);
 assert.equal((await run(h,request('/ingest','POST',{source:'gmail',records:[]}))).status,422);
 assert.equal((await run(h,request('/purge?source=chatgpt','DELETE',null,{origin:'https://evil.example'}))).status,403);
});
test('Google sync requires scoped OAuth read before any index write',async()=>{
 let wrote=false;
 const store={...fakeStore(),async ingest(){wrote=true;return {added:1}}};
 const h=createHistoryIndexHandler({makeStore:()=>store,
  googleToken:async()=>{throw Error('GOOGLE_SCOPE_RECONNECT_REQUIRED');},
  googlePage:async()=>{throw Error('MUST_NOT_READ_PROVIDER');}});
 const r=await run(h,request('/sync','POST',{source:'drive'}));
 assert.equal(r.status,503);
 assert.equal(wrote,false);
 assert.equal(r.body.error.code,'HISTORY_SOURCE_HOLD');
});
test('bounded Google continuation is persisted only after successful encrypted import',async()=>{
 const calls=[];
 const h=createHistoryIndexHandler({
  makeStore:()=>({...fakeStore(),
   async ingest(source,docs){calls.push('ingest '+source+' '+docs.length);return {added:1}},
   async checkpoint(source,cursor,done){calls.push('checkpoint '+source+' '+done);return {complete:done}}}),
  googleToken:async()=> 'bounded-token',
  googlePage:async()=>({source:'gmail',records:[{id:'m123456',title:'Note',body:'text'}],
   nextCursor:null,complete:true})});
 const r=await run(h,request('/sync','POST',{source:'gmail'}));
 assert.equal(r.status,200);
 assert.deepEqual(calls,['ingest gmail 1','checkpoint gmail true']);
 assert.equal(r.body.actionAuthorized,false);
});
