import test from 'node:test';
import assert from 'node:assert/strict';
import {createMarketCaseStudiesHandler} from './market-case-studies.mjs';
const sample=()=>({id:'BUSINESS-CASE-003',title:'Carbon bicycle market case study',
 market:'Premium endurance bicycles in India',asOf:'2026-11-06',
 evidence:[],model:{currency:'INR',unit:'framesets',sellingPrice:55000,
  variableCost:36000,monthlyFixedCost:200000,monthlyUnits:{bear:6,base:12,bull:20}}});
function fixture({email='shyamsundhar1982@gmail.com',withBucket=true}={}){
 const map=new Map();let writes=0;
 const bucket={
  async put(key,value){map.set(key,JSON.parse(value));writes++;return{etag:'saved'}},
  async get(key){return map.has(key)?{json:async()=>map.get(key)}:null},
  async list({prefix}){return{objects:[...map.keys()].filter(k=>k.startsWith(prefix))
   .map(key=>({key,uploaded:'2026-11-06T00:00:00Z'})),truncated:false}}
 };
 const handler=createMarketCaseStudiesHandler({getSession:()=>email?{email}:null,
  now:()=>new Date('2026-11-06T00:00:00.000Z'),
  uuid:()=> '11111111-1111-4111-8111-111111111111',
  fetchImpl:async()=>({ok:true,status:200,headers:{get:()=> 'application/rss+xml'},
   text:async()=>'<rss><channel><item><title>Premium bicycle sector changes for 2026</title><link>https://news.google.com/rss/articles/aaa</link><pubDate>Mon, 02 Nov 2026 10:00:00 GMT</pubDate><source>Cycle Outlet</source></item></channel></rss>'})});
 async function call(method='GET',body,url='https://vaos.test/api/market-case-studies',origin='https://vaos.test'){
  let status=200,data;
  const req={method,body,url,headers:{origin,'content-type':'application/json'},
   env:{VAOS_ARTIFACTS:withBucket?bucket:undefined}};
  const res={setHeader(){return res},status(x){status=x;return res},json(x){data=x;return res}};
  await handler(req,res);return {status,data};
 }
 return {call,stats:()=>({writes,count:map.size})};
}
test('founder authentication gates research and archive',async()=>{
 assert.equal((await fixture({email:''}).call()).status,401);
 assert.equal((await fixture({email:'someone@example.com'}).call()).status,403);
});
test('generating a study produces scenario math but performs no archive write',async()=>{
 const f=fixture();
 const p=await f.call('POST',{operation:'PREVIEW',case:sample()});
 assert.equal(p.status,200);
 assert.equal(p.data.data.persisted,false);
 assert.equal(p.data.data.report.unitEconomics.breakEvenUnits,11);
 assert.equal(f.stats().writes,0);
});
test('explicit founder SAVE creates immutable version that can be listed and read',async()=>{
 const f=fixture();
 assert.equal((await f.call('POST',{operation:'SAVE',case:sample()})).status,400);
 assert.equal((await f.call('POST',{operation:'SAVE',case:sample(),confirm:true},
  undefined,'https://attacker.test')).status,403);
 const saved=await f.call('POST',{operation:'SAVE',case:sample(),confirm:true});
 assert.equal(saved.status,201);
 assert.equal(f.stats().writes,1);
 const version=saved.data.data.version;
 const listing=await f.call();
 assert.equal(listing.data.data.records.length,1);
 const read=await f.call('GET',null,
  'https://vaos.test/api/market-case-studies?id=BUSINESS-CASE-003&record='+version);
 assert.equal(read.status,200);
 assert.equal(read.data.data.report.id,'BUSINESS-CASE-003');
 assert.equal(read.data.data.report.actionAuthorized,false);
});
test('query-only market scan distinguishes unverified headlines from market benchmarks',async()=>{
 const f=fixture();
 const r=await f.call('GET',null,
  'https://vaos.test/api/market-case-studies?q=India%20bicycle%20industry');
 assert.equal(r.status,200);
 assert.equal(r.data.data.context.status,'SINGLE_HEADLINE_UNVERIFIED');
 assert.equal(r.data.data.verifiedMarketBenchmark,false);
 assert.equal(f.stats().writes,0);
 assert.equal((await f.call('GET',null,
  'https://vaos.test/api/market-case-studies?q=secret%20company%20data')).status,422);
});
test('safe failure when archive is not provisioned and malformed studies are provided',async()=>{
 const f=fixture({withBucket:false});
 assert.equal((await f.call()).status,503);
 assert.equal((await f.call('POST',{operation:'PREVIEW',case:{}})).status,422);
 assert.equal((await f.call('POST',{operation:'SAVE',case:sample(),confirm:true})).status,503);
});

test('founder preview keeps continuity stress read only and requires no archive',async()=>{
 const f=fixture();
 const continuity={cashReserve:400000,demandDropPct:25,variableCostIncreasePct:20,
  supplierRecoveryDays:15,inventoryCoverDays:5,recoveryCost:50000};
 const p=await f.call('POST',{operation:'PREVIEW',case:{...sample(),continuity}});
 assert.equal(p.status,200);
 assert.equal(p.data.data.report.continuityStress.stressedUnits,6);
 assert.equal(p.data.data.report.continuityStress.fundingHold,false);
 assert.equal(p.data.data.report.actionAuthorized,false);
 assert.equal(f.stats().writes,0);
});
