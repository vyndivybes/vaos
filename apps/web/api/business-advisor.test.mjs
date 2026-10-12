import test from 'node:test';import assert from 'node:assert/strict';
import {createSessionToken,SESSION_COOKIE} from '../lib/auth.mjs';
import {createBusinessAdvisorHandler,parsePublicNewsFeed} from './business-advisor.mjs';
const mk=(question='Recommend a better procurement plan',lang='en',email='shyamsundhar1982@gmail.com')=>({
 method:'GET',url:'https://vaos.test/api/business-advisor?q='+encodeURIComponent(question)+'&lang='+lang,
 headers:{cookie:email?SESSION_COOKIE+'='+createSessionToken(email):''},
 env:{VAOS_VOICE_CONTROL:'founder-readonly-browser-v1'}});
const capture=()=>{const x={code:200,body:null};const res={setHeader(){return res},status(code){x.code=code;return res},json(data){x.body=data;return res}};return {x,res}};
const sources=(q)=>({execute:async job=>{
 const data=job.actionType==='COMMERCIAL.OBSERVE_PIPELINE'
  ?{records:[{id:'x',status:'confirmed',units:4,customer_name:'PRIVATE NAME'}]}
  :{records:[{id:'a',shortage_quantity:2}]};
 const authority={'COMMERCIAL.OBSERVE_PIPELINE':'listSalesOrders','PROCUREMENT.OBSERVE_SHORTAGE':'getConfiguredDemandShortages',
 'INVENTORY.OBSERVE_STOCK':'getAuthoritativeInventory','PRODUCTION.OBSERVE_WIP':'getProductionJobCards'}[job.actionType];
 return {actionType:job.actionType,sourceAuthority:authority,data};
 }});
test('founder signed session, read-only method, strict language and rejection of write commands',async()=>{
 let reads=0;const handler=createBusinessAdvisorHandler({getReader:()=>{reads++;return sources()}});
 for(const [req,expected] of [[mk('Forecast demand','en',''),401],[mk('Recommend procurement','en','other@example.com'),401],
  [{...mk(),method:'POST'},405],[mk('Approve all purchases'),422],[mk('Forecast demand','xx'),422]]){
  const {x,res}=capture();await handler(req,res);assert.equal(x.code,expected);
 }assert.equal(reads,0);
});
test('simulated forecasts are explicitly hypothetical, no sensitive sales data in output',async()=>{
 const handler=createBusinessAdvisorHandler({getReader:()=>sources()});
 const {x,res}=capture();await handler(mk('What if demand grows 25%? Recommend a better plan'),res);
 assert.equal(x.code,200);assert.equal(x.body.data.readOnly,true);
 assert.equal(x.body.data.actionAuthorized,false);
 assert.match(x.body.data.answer,/5 units/);
 assert.ok(!JSON.stringify(x.body).includes('PRIVATE NAME'));
 assert.equal(x.body.data.forecastQualified,false);
});
test('external comparison fetch sends only pre-selected public topic; headlines have links but no assumed truth',async()=>{
 const outgoing=[];
 const rss='<?xml version="1.0"?><rss><channel><item><title>Cycle industry investment watch</title><link>https://news.google.com/rss/articles/abc123</link><pubDate>Mon, 12 Oct 2026 09:00:00 GMT</pubDate></item></channel></rss>';
 const handler=createBusinessAdvisorHandler({getReader:()=>sources(),fetchImpl:async url=>{
  outgoing.push(url);return {ok:true,headers:{get:()=> 'application/rss+xml'},text:async()=>rss};}});
 const {x,res}=capture();await handler(mk('Compare our confidential sourcing rates with the market', 'en'),res);
 assert.equal(x.code,200);assert.equal(outgoing.length,1);
 assert.ok(outgoing[0].startsWith('https://news.google.com/rss/search?'));
 assert.ok(!outgoing[0].includes('secret'));
 assert.match(x.body.data.answer,/headline-level context/);
 assert.equal(x.body.data.webSources[0].url,'https://news.google.com/rss/articles/abc123');
});
test('unavailable Web stays explicit, not a fabricated competitor comparison',async()=>{
 const h=createBusinessAdvisorHandler({getReader:()=>sources(),fetchImpl:async()=>{throw Error('offline');}});
 const {res,x}=capture();await h(mk('Compare suppliers on the web'),res);
 assert.equal(x.code,200);
 assert.match(x.body.data.answer,/No independently qualifying current public sources/);
});
test('Indic translation only appears when verified numerals remain unchanged; language fallback remains English',async()=>{
 let calls=0;
 const h=createBusinessAdvisorHandler({getReader:()=>sources(),
  claim:async()=>({allowed:true,remaining:0}),
  translate:async(_ai,original,lang)=>{calls++;return original.replace('Business review','व्यवसाय समीक्षा');}});
 const req=mk('What if demand grows 25%? Recommend a better plan','hi');req.env.AI={run:async()=>{} };req.env.VAOS_ARTIFACTS={};
 const {res,x}=capture();await h(req,res);
 assert.equal(x.code,200);assert.equal(x.body.data.language,'hi');assert.equal(x.body.data.translationQualified,true);
 assert.ok(x.body.data.answer.includes('व्यवसाय समीक्षा'));assert.equal(calls,1);
});
test('RSS parser discards untrusted outbound domains and oversized or malformed feeds',()=>{
 const doc='<rss><item><title>Item 1</title><link>https://evil.example/redirect</link></item><item><title>Approved case</title><link>https://news.google.com/rss/articles/a1</link></item></rss>';
 const parsed=parsePublicNewsFeed(doc);assert.equal(parsed.length,1);
 assert.equal(parsed[0].title,'Approved case');
 assert.deepEqual(parsePublicNewsFeed('x'.repeat(150000)),[]);
});

test('model-assisted planning ranks only bounded observations and never makes business decisions',async()=>{
 const calls=[];
 const handler=createBusinessAdvisorHandler({getReader:()=>sources(),claim:async()=>({allowed:true,remaining:2}),
  fetchImpl:async()=>{throw Error('offline')},
 });
 const req0=mk('Recommend a better procurement plan and compare alternatives');req0.env.AI={
  run:async(model,params)=>{
   calls.push({model,prompt:params.prompt});
   return {response:JSON.stringify({choice:1,reason:'Conservative stock and shortage reconciliation should precede procurement changes.'})};
  }
 };req0.env.VAOS_ARTIFACTS={};
 const {x,res}=capture();await handler(req0,res);
 assert.equal(x.code,200);
 assert.equal(x.body.data.agenticRecommendation,'MODEL_ASSISTED_UNVERIFIED');
 assert.match(x.body.data.answer,/option 1/i);
 assert.equal(x.body.data.actionAuthorized,false);
 assert.equal(calls.length,1);
 assert.ok(!calls[0].prompt.includes('PRIVATE NAME'));
});

test('Google News RSS links with safe oc query suffix are retained as externally unverified sources',()=>{
 const feed='<rss><item><title>Bicycle manufacturing report</title><link>https://news.google.com/rss/articles/abc123?oc=5</link></item></rss>';
 assert.equal(parsePublicNewsFeed(feed)[0].url,'https://news.google.com/rss/articles/abc123');
});

test('business advice returns deterministic non-executing verify/diagnose/compare/decide cycle and qualified forecast HOLD',async()=>{
 const handler=createBusinessAdvisorHandler({getReader:()=>sources(),fetchImpl:async()=>{throw Error('offline')}});
 const {res,x}=capture();
 await handler(mk('Recommend a better group operating plan and forecast six months'),res);
 assert.equal(x.code,200);
 assert.equal(x.body.data.planningCycle.authority,'READ_ONLY_ADVISORY');
 assert.equal(x.body.data.planningCycle.actionAuthorized,false);
 assert.equal(x.body.data.planningCycle.automationExecuted,false);
 assert.deepEqual(x.body.data.planningCycle.steps.map(s=>s.phase),['VERIFY','DIAGNOSE','COMPARE','DECIDE']);
 assert.equal(x.body.data.planningCycle.forecastReadiness.qualified,false);
 assert.equal(x.body.data.planningCycle.forecastReadiness.projection,null);
 assert.ok(x.body.data.planningCycle.holds.includes('GROUP_ELIMINATION_UNVERIFIED'));
 assert.match(x.body.data.answer,/PLAN GATES/);
 assert.match(x.body.data.answer,/FORECAST QUALIFICATION/);
 assert.ok(!JSON.stringify(x.body.data).includes('PRIVATE NAME'));
});
test('missing signed sources never trigger model-directed business writes',async()=>{
 const handler=createBusinessAdvisorHandler({getReader:()=>({execute:async()=>{throw Error('backend offline')}}),
  fetchImpl:async()=>{throw Error('offline')}});
 const {res,x}=capture();await handler(mk('Plan production bottlenecks'),res);
 assert.equal(x.code,200);
 assert.equal(x.body.data.status,'HOLD');
 assert.equal(x.body.data.planningCycle.state,'EVIDENCE_INCOMPLETE');
 assert.equal(x.body.data.planningCycle.actionAuthorized,false);
 assert.match(x.body.data.answer,/DATA GAPS/);
});
