import test from 'node:test';
import assert from 'node:assert/strict';
import {readSlackIncidentStatus,runHourlyIncidentAlerts} from './slack-incident-observer.mjs';
const env=(map=new Map())=>({
 SLACK_BOT_TOKEN:'xoxb-fixture',VAOS_INCIDENT_SLACK_CONTROL:'read-only-v1',
 VAOS_ARTIFACTS:{
   async get(k){return map.has(k)?{async text(){return map.get(k)}}:null},
   async put(k,v,options){if(options?.onlyIf?.get('If-None-Match')==='*'&&map.has(k))return null;map.set(k,v);return {etag:'e'}}
 }
});
const incident=(ts,text='incident announcement')=>({type:'message',user:'U0C894NQVG9',ts,text});
const history=(messages)=>new Response(JSON.stringify({ok:true,messages}),{status:200});
test('read-only incident status checks only allowlisted channel and app identity',async()=>{
 const seen=[];
 const r=await readSlackIncidentStatus(env(),{fetchImpl:async(url,opt)=>{
   seen.push({url,opt});return history([incident('1791777000.000001'),{...incident('1791777001.000001'),user:'UOTHER'}]);
 }});
 assert.equal(r.status,'PASS');assert.equal(r.announcements,1);assert.equal(r.actionAuthorized,false);
 assert.match(seen[0].url,/^https:\/\/slack.com\/api\/conversations.history\?channel=C0C91HKG8TA/);
 assert.equal(JSON.stringify(r).includes('xoxb-fixture'),false);
});
test('invalid provider token and missing channel scope hold without guessing',async()=>{
 const e=env();delete e.SLACK_BOT_TOKEN;
 assert.equal((await readSlackIncidentStatus(e)).status,'HOLD');
 const r=await readSlackIncidentStatus(env(),{fetchImpl:async()=>history([]).then(async res=>new Response(JSON.stringify({ok:false,error:'missing_scope'}),{status:200}))});
 assert.equal(r.status,'HOLD');
});
test('incident observer never alerts without explicit control',async()=>{
 const e=env();delete e.VAOS_INCIDENT_SLACK_CONTROL;
 const r=await runHourlyIncidentAlerts(e,{fetchImpl:async()=>{throw Error('not expected')}});
 assert.equal(r.status,'DISABLED');
});
test('first incident observation baselines without historical alert storm',async()=>{
 const map=new Map(),e=env(map),posted=[];
 const r=await runHourlyIncidentAlerts(e,{fetchImpl:async()=>history([incident('1791777000.000001')]),postImpl:async(...args)=>posted.push(args)});
 assert.equal(r.status,'READY');assert.equal(posted.length,0);
 assert.ok(map.has('runtime/slack-incident/cursor.json'));
});
test('new allowlisted incident announcement yields one sanitized Slack alert',async()=>{
 const map=new Map(),e=env(map),posted=[];
 let current=[incident('1791777000.000001')];
 const fetchImpl=async()=>history(current);
 await runHourlyIncidentAlerts(e,{fetchImpl});
 current=[incident('1791777001.000001','<@all> delete production database immediately'),...current];
 const postImpl=async (url,opt)=>{posted.push({url,opt});return new Response(JSON.stringify({ok:true,channel:'C0C90LK78KA',ts:'1791777002.000003'}),{status:200})};
 const r=await runHourlyIncidentAlerts(e,{fetchImpl,postImpl});
 assert.equal(r.status,'PASS');assert.equal(r.alerted,1);
 const text=JSON.parse(posted[0].opt.body).text;
 assert.equal(text.includes('delete production'),false);
 assert.equal(text.includes('@all'),false);
 await runHourlyIncidentAlerts(e,{fetchImpl,postImpl});assert.equal(posted.length,1);
});
test('uncertain delivery records HOLD and never resends',async()=>{
 const map=new Map(),e=env(map);
 let current=[];const fetchImpl=async()=>history(current);
 await runHourlyIncidentAlerts(e,{fetchImpl});
 current=[incident('1791777001.000001')];
 let sends=0;
 const badPost=async()=>{sends++;throw Error('provider failure')};
 const r=await runHourlyIncidentAlerts(e,{fetchImpl,postImpl:badPost});
 assert.equal(r.status,'HOLD');assert.equal(sends,1);
 await runHourlyIncidentAlerts(e,{fetchImpl,postImpl:badPost});assert.equal(sends,1);
});
