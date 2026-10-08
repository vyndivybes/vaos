import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionToken,SESSION_COOKIE} from '../lib/auth.mjs';
import {createProjectScheduleHandler} from './project-schedule.mjs';
import {DEFAULT_API_HANDLERS} from '../cloudflare-worker.mjs';
function response(){
 const state={status:200,headers:{},body:null};
 const res={setHeader(k,v){state.headers[k]=v;return res},status(n){state.status=n;return res},json(v){state.body=v;return res}};
 return {res,state};
}
function req({method='GET',url='https://vaos.test/api/project-schedule?projectId=VYNDI-MASTER-PROGRAM',email='operator@example.com',allowlist='operator@example.com'}={}){
 return {method,url,headers:{cookie:email?`${SESSION_COOKIE}=${createSessionToken(email)}`:''},env:{VAOS_SCHEDULE_READERS:allowlist}};
}
test('route registered and requires authenticated explicitly allowlisted schedule reader',async()=>{
 assert.equal(typeof DEFAULT_API_HANDLERS['/api/project-schedule'],'function');
 let calls=0;
 const handler=createProjectScheduleHandler({getReader:()=>({async assess(){calls++;return {assessment:{status:'WITHHELD'},recommendation:{status:'NOT_ELIGIBLE'}};}})});
 for(const input of [{email:''},{allowlist:''},{email:'other@example.com'}]){
  const {res,state}=response();await handler(req(input),res);
  assert.ok([401,403].includes(state.status));
 }
 assert.equal(calls,0);
});
test('read-only signed schedule result returned with no-store for authorized user',async()=>{
 const handler=createProjectScheduleHandler({getReader:()=>({async assess(projectId){assert.equal(projectId,'VYNDI-MASTER-PROGRAM');return {assessment:{status:'WITHHELD',reason:'INDEPENDENT_APPROVAL_REQUIRED'},recommendation:{status:'NOT_ELIGIBLE'}};}})});
 const {res,state}=response();await handler(req(),res);
 assert.equal(state.status,200);
 assert.equal(state.headers['Cache-Control'],'no-store');
 assert.equal(state.body.data.assessment.status,'WITHHELD');
});
test('reject POST and malformed project ID without accessing backend',async()=>{
 let touched=0;
 const handler=createProjectScheduleHandler({getReader:()=>{touched++;return {}}});
 let o=response();await handler(req({method:'POST'}),o.res);
 assert.equal(o.state.status,405);
 o=response();await handler(req({url:'https://vaos.test/api/project-schedule?projectId=../secret'}),o.res);
 assert.equal(o.state.status,422);assert.equal(touched,0);
});
