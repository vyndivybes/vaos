import test from 'node:test';
import assert from 'node:assert/strict';
import {runFounderWorkspaceDigest} from './google-founder-daily-brief.mjs';
function setup(){
 const map=new Map(),sent=[];
 const env={VAOS_GOOGLE_BRIEF_CONTROL:'founder-daily-readonly-v1',SLACK_BOT_TOKEN:'xoxb-test',
 VAOS_ARTIFACTS:{
  async get(k){return map.has(k)?{async text(){return map.get(k)}}:null},
  async put(k,v,opt){if(opt?.onlyIf?.get('If-None-Match')==='*'&&map.has(k))return null;map.set(k,v);return {etag:'x'}}
 }};
 return {map,sent,env};
}
test('daily digest disabled by default',async()=>{
 const s=setup();delete s.env.VAOS_GOOGLE_BRIEF_CONTROL;
 const r=await runFounderWorkspaceDigest(s.env,{brief:async()=>{throw Error('wrong')}});
 assert.equal(r.status,'DISABLED');assert.equal(s.map.size,0);
});
test('unverified Google data never posts to Slack',async()=>{
 const s=setup();
 const r=await runFounderWorkspaceDigest(s.env,{brief:async()=>({status:'HOLD'})});
 assert.equal(r.status,'HOLD');assert.equal(s.map.size,0);
});
test('qualified digest sends to private founder DM once on scheduled local morning',async()=>{
 const s=setup();
 const post=async(url,init)=>{s.sent.push({url,body:JSON.parse(init.body)});return new Response(JSON.stringify({ok:true,channel:'D0C7RKVTRK9',ts:'1791776800.123456'}),{status:200})};
 const options={now:()=>Date.parse('2026-10-12T02:30:00Z'),fetchImpl:post,brief:async()=>({status:'PASS',actionAuthorized:false,answer:'Calendar events 2; recent Drive metadata 4.'})};
 const a=await runFounderWorkspaceDigest(s.env,options);
 assert.equal(a.status,'PASS');assert.equal(s.sent.length,1);
 assert.equal(s.sent[0].body.channel,'D0C7RKVTRK9');
 assert.equal(s.sent[0].body.text.includes('Drive metadata'),true);
 const b=await runFounderWorkspaceDigest(s.env,options);
 assert.equal(b.status,'READY');assert.equal(s.sent.length,1);
});
test('digests do not send outside morning window',async()=>{
 const s=setup();const r=await runFounderWorkspaceDigest(s.env,{now:()=>Date.parse('2026-10-12T09:00:00Z'),
 brief:async()=>{throw Error('must not read')}});
 assert.equal(r.status,'READY');
});
