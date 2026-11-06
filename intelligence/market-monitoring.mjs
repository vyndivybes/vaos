/** Governed founder-only read-side market monitoring.
 * Once per daily UTC scheduled trigger; external feeds are keyless and fixed-host.
 * R2 stores only a bounded provenance snapshot; no business transaction is touched.
 */
import {collectMarketPublicEvidence} from './market-public-sources.mjs';
import {backtestPublicIndicator} from './market-series-forecast.mjs';
export const LATEST_KEY='jarvis/founder/market-intel/v2/latest.json';
const control='founder-daily-readonly-v1';
export async function refreshMarketIntelligence({bucket,fetchImpl=globalThis.fetch,collect,now=()=>new Date()}={}){
 if(!bucket||typeof bucket.get!=='function'||typeof bucket.put!=='function')throw Error('MARKET_ARCHIVE_UNAVAILABLE');
 const evidence=await (collect||(()=>collectMarketPublicEvidence({fetchImpl,now})))();
 if(evidence?.schemaVersion!=='VAOS_MARKET_PUBLIC_EVIDENCE_V1')throw Error('MARKET_EVIDENCE_INVALID');
 const bank=evidence.worldBank||{},trade=evidence.comtrade||{},competition=evidence.competitors||{};
 const observed=[bank.gdp?.status==='OBSERVED',bank.inflation?.status==='OBSERVED',
  trade.status==='OBSERVED',competition.status==='UNVERIFIED_HEADLINE_CONTEXT'];
 if(!observed.some(Boolean))throw Error('MARKET_FEEDS_UNAVAILABLE');
 let previous=null;
 try{previous=await bucket.get(LATEST_KEY);previous=previous?await previous.json():null}
 catch{throw Error('MARKET_ARCHIVE_READ_HOLD')}
 const old=new Set((previous?.evidence?.competitors?.items||[]).map(a=>a.watchId+':'+a.url));
 const newArticles=(competition.items||[]).filter(a=>!old.has(a.watchId+':'+a.url));
 const at=now().toISOString();
 const snapshot={
  schemaVersion:'VAOS_PUBLIC_MARKET_SNAPSHOT_V2',collectedAt:at,
  status:observed.every(Boolean)?'SOURCES_OBSERVED':'PARTIAL_OBSERVATIONS',
  evidence,
  indicatorBacktests:Object.fromEntries(['gdp','inflation'].map(k=>[k,
   backtestPublicIndicator(bank[k]?.series||[],{source:'WORLD_BANK_V2',
    indicator:bank[k]?.indicator||'UNAVAILABLE',unit:bank[k]?.unit||'UNAVAILABLE'})])),
  competitorChanges:{
   initialBaseline:previous===null,newCount:previous===null?0:newArticles.length,
   items:previous===null?[]:newArticles.slice(0,10),
   verifiedPriceChanges:0,description:'Article URL additions only. No independent commercial-price verification.'
  },
  demandForecastQualified:false,marketSizeQualified:false,actionAuthorized:false,readOnly:true,
  qualification:'PUBLIC_OBSERVATIONS_AND_BACKTESTS_NOT_INDEPENDENT_MARKET_FORECAST'
 };
 await bucket.put(LATEST_KEY,JSON.stringify(snapshot),{httpMetadata:{contentType:'application/json'}});
 return snapshot;
}
export async function runScheduledMarketMonitor({env,scheduledTime=Date.now(),fetchImpl=globalThis.fetch,collect}={}){
 if(env?.VAOS_MARKET_MONITOR_CONTROL!==control)return{status:'SKIPPED',reason:'CONTROL_DISABLED'};
 const date=new Date(scheduledTime);
 if(!Number.isFinite(date.getTime())||date.getUTCHours()!==1||date.getUTCMinutes()!==0)
  return{status:'SKIPPED',reason:'OUTSIDE_DAILY_WINDOW'};
 return refreshMarketIntelligence({bucket:env.VAOS_ARTIFACTS,fetchImpl,collect,now:()=>date});
}
