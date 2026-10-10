import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionToken,SESSION_COOKIE} from '../lib/auth.mjs';
import {createFounderAgentBriefHandler} from './founder-agent-brief.mjs';
import {DEFAULT_API_HANDLERS} from '../cloudflare-worker.mjs';
function harness(options={}){
 const calls=[];
 const control={agents:[{id:'vibpe'}],workforce:{digitalEmployees:[{id:'vibpe',status:'ACTIVE',qualificationLevel:3}]}};
 const mission={mission:{id:'mission-1234',status:'ACTIVE'},workPackages:[],handoffs:[]};
 const handler=createFounderAgentBriefHandler({
  getControlService:()=>({snapshot:async()=>{calls.push('control');if(options.failure)throw Error('SECRET');return control;}}),
  getMissionService:()=>({snapshot:async id=>{calls.push('mission:'+id);return mission;}}),
  now:()=> '2026-10-11T01:00:00Z'
 });
 const make=async({email='shyamsundhar1982@gmail.com',enabled=true,query='?agentId=vibpe',method='GET'}={})=>{
  const response={status:200,headers:{},body:null};
  const res={setHeader(n,v){response.headers[n]=v;return res},status(n){response.status=n;return res},json(x){response.body=x;return res}};
  await handler({method,url:'https://vaos.example/api/founder-agent-brief'+query,headers:{
   cookie:email?SESSION_COOKIE+'='+createSessionToken(email):''},env:{VAOS_FOUNDER_BRIEF_CONTROL:enabled?'read-only-v1':'off'}},res);
  return response;
 };
 return {calls,make};
}
test('registers bounded read-only founder-agent brief route',()=>{
 assert.equal(typeof DEFAULT_API_HANDLERS['/api/founder-agent-brief'],'function');
});
test('unauthenticated, checker and disabled access never read control plane',async()=>{
 const f=harness();
 assert.equal((await f.make({email:null})).status,401);
 assert.equal((await f.make({email:'kaaviyam1519@gmail.com'})).status,403);
 assert.equal((await f.make({enabled:false})).status,409);
 assert.deepEqual(f.calls,[]);
});
test('strict query validation blocks unknown agents, duplicate keys and injection',async()=>{
 const f=harness();
 for(const query of ['?agentId=x','?agentId=vibpe&agentId=qa','?agentId=vibpe&actorEmail=founder','?agentId=vibpe&missionId=bad']){
  assert.equal((await f.make({query})).status,422);
 }
 assert.deepEqual(f.calls,[]);
});
test('founder receives attributable deterministic read-only agent report',async()=>{
 const f=harness();const res=await f.make({query:'?agentId=vibpe&missionId=mission-1234'});
 assert.equal(res.status,200);assert.deepEqual(f.calls,['control','mission:mission-1234']);
 assert.equal(res.body.data.missionId,'mission-1234');
 assert.equal(res.body.data.agentReply,false);
 assert.equal(res.body.data.executionAuthorized,false);
 assert.equal(res.headers['Cache-Control'],'no-store');
});
test('disallowed method and backend failure provide no privileged content',async()=>{
 const f=harness({failure:true});
 assert.equal((await f.make({method:'POST'})).status,405);
 const res=await f.make();
 assert.equal(res.status,503);assert.doesNotMatch(JSON.stringify(res.body),/SECRET/);
});
