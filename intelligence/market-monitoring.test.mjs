import test from 'node:test';
import assert from 'node:assert/strict';
import {refreshMarketIntelligence,runScheduledMarketMonitor,LATEST_KEY} from './market-monitoring.mjs';
function bucket(){
 const rows=new Map();
 return {rows,async get(k){return rows.has(k)?{json:async()=>rows.get(k)}:null},
 async put(k,body){rows.set(k,JSON.parse(body));return{etag:'stored'}}};
}
const evidence=()=>({
 schemaVersion:'VAOS_MARKET_PUBLIC_EVIDENCE_V1',collectedAt:'2026-11-06T01:00:00Z',
 worldBank:{gdp:{status:'OBSERVED',source:'WORLD_BANK_V2',indicator:'NY.GDP.MKTP.KD.ZG',
 unit:'PERCENT_ANNUAL',series:Array.from({length:9},(_,i)=>({year:2017+i,value:4+i/10}))},
 inflation:{status:'HOLD',series:[]}},
 comtrade:{status:'HOLD',observations:[]},
 competitors:{status:'UNVERIFIED_HEADLINE_CONTEXT',items:[{watchId:'trek',url:'https://example.com/a'}]},
 actionAuthorized:false,demandForecastQualified:false
});
test('first monitored collection is a baseline and preserves immutable evidence fields',async()=>{
 const b=bucket();
 const x=await refreshMarketIntelligence({bucket:b,collect:async()=>evidence(),now:()=>new Date('2026-11-06T01:00:00Z')});
 assert.equal(x.status,'PARTIAL_OBSERVATIONS');
 assert.equal(x.competitorChanges.newCount,0);
 assert.equal(x.indicatorBacktests.gdp.status,'BACKTESTED_INDICATOR_EXTRAPOLATION');
 assert.equal(x.indicatorBacktests.gdp.forecastQualified,false);
 assert.equal(b.rows.get(LATEST_KEY).actionAuthorized,false);
});
test('later collection detects new article URLs but does not verify commercial claims',async()=>{
 const b=bucket();
 await refreshMarketIntelligence({bucket:b,collect:async()=>evidence(),now:()=>new Date('2026-11-06T01:00:00Z')});
 const next=evidence();next.competitors.items.push({watchId:'canyon',url:'https://example.com/b'});
 const x=await refreshMarketIntelligence({bucket:b,collect:async()=>next,now:()=>new Date('2026-11-07T01:00:00Z')});
 assert.equal(x.competitorChanges.newCount,1);
 assert.equal(x.competitorChanges.verifiedPriceChanges,0);
 assert.equal(x.demandForecastQualified,false);
});
test('failed feeds do not overwrite a healthy persisted snapshot',async()=>{
 const b=bucket();
 await refreshMarketIntelligence({bucket:b,collect:async()=>evidence(),now:()=>new Date('2026-11-06T01:00:00Z')});
 const failed=evidence();failed.worldBank.gdp={status:'HOLD',series:[]};failed.competitors={status:'HOLD',items:[]};
 await assert.rejects(()=>refreshMarketIntelligence({bucket:b,collect:async()=>failed,now:()=>new Date('2026-11-07T01:00:00Z')}),/MARKET_FEEDS_UNAVAILABLE/);
 assert.equal(b.rows.get(LATEST_KEY).collectedAt,'2026-11-06T01:00:00.000Z');
});
test('scheduled worker enforces once-daily control and can disable without writes',async()=>{
 const b=bucket();
 const collect=async()=>evidence();
 assert.equal((await runScheduledMarketMonitor({env:{VAOS_ARTIFACTS:b},collect,scheduledTime:Date.parse('2026-11-06T01:00:00Z')})).status,'SKIPPED');
 assert.equal((await runScheduledMarketMonitor({env:{VAOS_ARTIFACTS:b,VAOS_MARKET_MONITOR_CONTROL:'founder-daily-readonly-v1'},collect,scheduledTime:Date.parse('2026-11-06T02:00:00Z')})).status,'SKIPPED');
 assert.equal((await runScheduledMarketMonitor({env:{VAOS_ARTIFACTS:b,VAOS_MARKET_MONITOR_CONTROL:'founder-daily-readonly-v1'},collect,scheduledTime:Date.parse('2026-11-06T01:00:00Z')})).status,'PARTIAL_OBSERVATIONS');
 assert.equal(b.rows.size,1);
});
