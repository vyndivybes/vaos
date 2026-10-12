import test from 'node:test';
import assert from 'node:assert/strict';
import {readVaosGitHubCi,runHourlyCiAlerts} from './github-slack-ci.mjs';
const env=(states=new Map())=>({
 VAOS_FEDERATED_GITHUB_TOKEN:'github-test-secret',
 SLACK_BOT_TOKEN:'xoxb-test',
 VAOS_GITHUB_SLACK_CONTROL:'failure-alerts-v1',
 VAOS_ARTIFACTS:{
  async get(key){const x=states.get(key);return x?{async text(){return x;}}:null},
  async put(key,val,opt){if(opt?.onlyIf?.get('If-None-Match')==='*'&&states.has(key))return null;states.set(key,val);return {etag:'test'}}
 }
});
const run=(id,status,conclusion,name='web-smoke')=>({id,status,conclusion,name,html_url:'https://github.com/vyndivybes/vaos/actions/runs/'+id,created_at:'2026-10-12T02:00:00Z'});
const response=(runs)=>new Response(JSON.stringify({workflow_runs:runs}),{status:200,headers:{'content-type':'application/json'}});
test('GitHub CI readback holds when even public API cannot be read',async()=>{
 const e=env();delete e.VAOS_FEDERATED_GITHUB_TOKEN;
 const r=await readVaosGitHubCi(e,{fetchImpl:async()=>{throw Error('network unavailable')}});
 assert.equal(r.status,'HOLD');assert.equal(r.actionAuthorized,false);
});
test('GitHub CI uses bounded authenticated read-only API request',async()=>{
 const seen=[];
 const e=env();
 const r=await readVaosGitHubCi(e,{fetchImpl:async(url,opts)=>{
  seen.push({url,opts});return response([run(123,'completed','success'),run(124,'completed','failure'),run(125,'in_progress',null)]);
 }});
 assert.equal(r.status,'PASS');
 assert.equal(r.failed,1);assert.equal(r.running,1);
 assert.equal(r.actionAuthorized,false);
 assert.match(r.answer,/GitHub Actions/);
 assert.equal(seen.length,1);assert.match(seen[0].url,/^https:\/\/api.github.com\/repos\/vyndivybes\/vaos\/actions\/runs\?/);
 assert.equal(seen[0].opts.method,'GET');
 assert.equal(JSON.stringify(r).includes('github-test-secret'),false);
});
test('GitHub provider failure never produces guessed status',async()=>{
 const e=env();
 const r=await readVaosGitHubCi(e,{fetchImpl:async()=>new Response('unauthorized',{status:401})});
 assert.equal(r.status,'HOLD');
 assert.equal(r.answer.includes('PASS'),false);
});
test('alerts are disabled by default and never send messages',async()=>{
 const e=env();delete e.VAOS_GITHUB_SLACK_CONTROL;
 const r=await runHourlyCiAlerts(e,{fetchImpl:async()=>{throw Error('unexpected')},postImpl:async()=>{throw Error('unexpected')}});
 assert.equal(r.status,'DISABLED');
});
test('first monitored run baselines without replaying old failures',async()=>{
 const s=new Map(),e=env(s),posted=[];
 const r=await runHourlyCiAlerts(e,{fetchImpl:async()=>response([run(123,'completed','failure')]),postImpl:async(...args)=>posted.push(args)});
 assert.equal(r.status,'READY');assert.equal(posted.length,0);assert.ok(s.has('runtime/github-ci/cursor.json'));
});
test('new CI failure posts one sanitized alert then suppresses duplicate',async()=>{
 const s=new Map(),e=env(s),posted=[];
 let runs=[run(100,'completed','success')];
 const fetchImpl=async()=>response(runs);
 const postImpl=async(url,opts)=>{posted.push({url,opts});return new Response(JSON.stringify({ok:true,channel:'C0C90LK78KA',ts:'1791763200.000123'}),{status:200});};
 await runHourlyCiAlerts(e,{fetchImpl,postImpl});
 runs=[run(101,'completed','failure','malicious <@all> \\n'),...runs];
 const r=await runHourlyCiAlerts(e,{fetchImpl,postImpl});
 assert.equal(r.status,'PASS');assert.equal(r.alerted,1);
 assert.equal(posted.length,1);assert.equal(posted[0].url,'https://slack.com/api/chat.postMessage');
 const body=JSON.parse(posted[0].opts.body);assert.equal(body.channel,'C0C90LK78KA');
 assert.equal(body.text.includes('<@all>'),false);
 const again=await runHourlyCiAlerts(e,{fetchImpl,postImpl});
 assert.equal(again.alerted,0);assert.equal(posted.length,1);
 assert.equal(JSON.parse(s.get('runtime/github-ci/failures/101.json')).state,'SENT');
});
test('ambiguous Slack delivery is recorded HOLD and not automatically retried',async()=>{
 const s=new Map(),e=env(s);
 let runs=[run(100,'completed','success')];
 const fetchImpl=async()=>response(runs);
 await runHourlyCiAlerts(e,{fetchImpl});
 runs=[run(101,'completed','failure')];
 let attempts=0;
 const postImpl=async()=>{attempts++;throw Error('network disconnected')};
 const r=await runHourlyCiAlerts(e,{fetchImpl,postImpl});
 assert.equal(r.status,'HOLD');assert.equal(attempts,1);
 await runHourlyCiAlerts(e,{fetchImpl,postImpl});assert.equal(attempts,1);
 assert.equal(JSON.parse(s.get('runtime/github-ci/failures/101.json')).state,'HOLD');
});
test('source failures cannot cause Slack posts or expose provider errors',async()=>{
 const s=new Map(),e=env(s),posted=[];
 const r=await runHourlyCiAlerts(e,{fetchImpl:async()=>new Response('x',{status:401}),postImpl:async(...a)=>posted.push(a)});
 assert.equal(r.status,'HOLD');assert.equal(posted.length,0);
});

test('public repository read falls back to no authorization after stale token rejection',async()=>{
 const e=env();const seen=[];
 const result=await readVaosGitHubCi(e,{fetchImpl:async(url,options)=>{
  seen.push({url,auth:options.headers.Authorization||null});
  if(seen.length===1)return new Response('',{status:401});
  return response([run(881,'completed','success')]);
 }});
 assert.equal(result.status,'PASS');assert.equal(seen.length,2);
 assert.ok(seen[0].auth?.startsWith('Bearer '));assert.equal(seen[1].auth,null);
});
test('public read works without a token for this allowlisted public repository only',async()=>{
 const e=env();delete e.VAOS_FEDERATED_GITHUB_TOKEN;
 const result=await readVaosGitHubCi(e,{fetchImpl:async()=>response([run(88,'completed','success')])});
 assert.equal(result.status,'PASS');
});

test('GitHub HOLD distinguishes network failure without exposing errors',async()=>{
 const r=await readVaosGitHubCi(env(),{fetchImpl:async()=>{throw Error('secret provider traceback')}});
 assert.equal(r.status,'HOLD');assert.equal(r.reason,'GITHUB_NETWORK_FAILURE');
 assert.equal(JSON.stringify(r).includes('secret provider traceback'),false);
});
test('GitHub public fallback also covers failed private-token network attempt',async()=>{
 let calls=0;
 const r=await readVaosGitHubCi(env(),{fetchImpl:async()=>{
  calls++;if(calls===1)throw Error('token-specific error');
  return response([run(999,'completed','success')]);
 }});
 assert.equal(calls,2);assert.equal(r.status,'PASS');
});
