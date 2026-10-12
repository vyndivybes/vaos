import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionToken,SESSION_COOKIE} from '../lib/auth.mjs';
import {createGroupPortfolioHandler} from './group-portfolio.mjs';
import {READ_DOMAINS} from '../lib/group-portfolio.mjs';
import {DEFAULT_API_HANDLERS} from '../cloudflare-worker.mjs';
const response=()=>{const state={status:200,headers:{},body:null};const res={
 setHeader(k,v){state.headers[k]=v;return res;},
 status(n){state.status=n;return res;},
 json(x){state.body=x;return res;}
};return {state,res};};
const request=(email='shyamsundhar1982@gmail.com',method='GET')=>({
 method,headers:{cookie:email?SESSION_COOKIE+'='+createSessionToken(email):''},env:{}
});
test('VAOS group route requires founder session and GET; never runs source reads otherwise',async()=>{
 let attempts=0;const handler=createGroupPortfolioHandler({getReader:()=>{attempts++;return {execute:async()=>({})}}});
 assert.equal(typeof DEFAULT_API_HANDLERS['/api/group-portfolio'],'function');
 for(const args of [[''],['viewer@example.com'],['shyamsundhar1982@gmail.com','POST']]){
  const {state,res}=response();
  await handler(request(...args),res);
  assert.notEqual(state.status,200);
 }
 assert.equal(attempts,0);
});
test('observations use signed read actions and return no raw business records',async()=>{
 const seen=[];
 const handler=createGroupPortfolioHandler({getReader:()=>({execute:async job=>{
   seen.push(job.actionType);return {actionType:job.actionType,sourceAuthority:READ_DOMAINS.find(x=>x.actionType===job.actionType).authority,data:{staff:[{name:'Private',salary:123456}]}};
 }})});
 const {state,res}=response();await handler(request(),res);
 assert.equal(state.status,200);
 assert.equal(state.body.data.sourceCoverage.verified,READ_DOMAINS.length);
 assert.equal(state.body.data.financialConsolidation,'HOLD');
 assert.equal(state.body.data.groupRevenue,null);
 assert.equal(seen.length,READ_DOMAINS.length);
 assert.ok(!JSON.stringify(state.body).includes('Private'));
 assert.equal(state.headers['Cache-Control'],'no-store');
});
test('one failing source becomes HOLD and cannot erase other verified observations',async()=>{
 const handler=createGroupPortfolioHandler({getReader:()=>({execute:async job=>{
   if(job.actionType==='PEOPLE.OBSERVE_WORKFORCE')throw Error('secret-system-error');
   const spec=READ_DOMAINS.find(x=>x.actionType===job.actionType);
   return {actionType:job.actionType,sourceAuthority:spec.authority,data:{status:'ready'}};
 }})});
 const {state,res}=response();await handler(request(),res);
 assert.equal(state.status,200);
 assert.equal(state.body.data.sources.find(x=>x.id==='people').status,'HOLD');
 assert.ok(state.body.data.sourceCoverage.verified>=1);
 assert.ok(!JSON.stringify(state.body).includes('secret-system-error'));
});
test('unmatched response authority is HOLD instead of a signed read',async()=>{
 const handler=createGroupPortfolioHandler({getReader:()=>({execute:async job=>({actionType:job.actionType,sourceAuthority:'wrong',data:{ok:true}})})});
 const {state,res}=response();await handler(request(),res);
 assert.equal(state.status,200);
 assert.equal(state.body.data.sourceCoverage.verified,0);
});
