import test from 'node:test';
import assert from 'node:assert/strict';
import {createMarketPublicIntelligenceHandler} from './market-public-intelligence.mjs';
const sample=()=>({schemaVersion:'VAOS_MARKET_PUBLIC_EVIDENCE_V1',
 worldBank:{gdp:{status:'OBSERVED',indicator:'NY.GDP.MKTP.KD.ZG',unit:'PERCENT_ANNUAL',
 series:Array.from({length:9},(_,i)=>({year:2017+i,value:i+1}))}},
 comtrade:{status:'HOLD',observations:[]},
 competitors:{status:'HOLD',items:[]},
 demandForecastQualified:false,actionAuthorized:false});
function fixture(email='shyamsundhar1982@gmail.com'){
 let writes=0;const records=new Map();
 const bucket={async get(key){return records.has(key)?{json:async()=>records.get(key)}:null},
  async put(key,raw){writes++;records.set(key,JSON.parse(raw));}};
 const handler=createMarketPublicIntelligenceHandler({
  getSession:()=>email?{email}:null,
  collect:async()=>sample(),now:()=>new Date('2026-11-06T01:00:00Z')
 });
 async function call(method='GET',body=null,url='https://vaos.test/api/market-public-intelligence',origin='https://vaos.test'){
  let status=200,json=null;const req={method,body,url,env:{VAOS_ARTIFACTS:bucket},
   headers:{origin,'content-type':'application/json'}};
  const res={setHeader(){return res},status(n){status=n;return res},json(data){json=data;return res}};
  await handler(req,res);return{status,json};
 }
 return{call,writes:()=>writes};
}
test('market public data is founder only and default GET never fetches or mutates',async()=>{
 assert.equal((await fixture('').call()).status,401);
 assert.equal((await fixture('not-founder@example.org').call()).status,403);
 const f=fixture();
 assert.equal((await f.call()).status,404);
 assert.equal(f.writes(),0);
});
test('manual REFRESH enforces explicit origin, consent and structured JSON',async()=>{
 const f=fixture();
 assert.equal((await f.call('POST',{operation:'REFRESH',confirm:true},undefined,'https://other.test')).status,403);
 assert.equal((await f.call('POST',{operation:'REFRESH'})).status,400);
 assert.equal((await f.call('POST',{operation:'OTHER',confirm:true})).status,422);
 assert.equal(f.writes(),0);
 const refresh=await f.call('POST',{operation:'REFRESH',confirm:true});
 assert.equal(refresh.status,200);
 assert.equal(refresh.json.data.snapshot.indicatorBacktests.gdp.status,'BACKTESTED_INDICATOR_EXTRAPOLATION');
 assert.equal(refresh.json.data.snapshot.demandForecastQualified,false);
 assert.equal(f.writes(),1);
 const replay=await f.call();
 assert.equal(replay.status,200);
 assert.equal(replay.json.data.snapshot.actionAuthorized,false);
});
test('query parameters and mutations beyond REFRESH are rejected',async()=>{
 const f=fixture();
 assert.equal((await f.call('GET',null,'https://vaos.test/api/market-public-intelligence?url=https://private.test')).status,422);
 assert.equal((await f.call('DELETE')).status,405);
});
