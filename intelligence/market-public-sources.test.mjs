import test from 'node:test';
import assert from 'node:assert/strict';
import {collectMarketPublicEvidence} from './market-public-sources.mjs';

const json=x=>({ok:true,status:200,headers:{get:()=> 'application/json'},text:async()=>JSON.stringify(x)});
const bank=[{page:1,pages:1},Array.from({length:10},(_,i)=>({
 date:String(2025-i),value:3+i/10,country:{value:'India'},countryiso3code:'IND',
 indicator:{id:'NY.GDP.MKTP.KD.ZG',value:'GDP growth (annual %)'}
}))];
function fixture(){
 const urls=[];
 async function fetchImpl(url,options){
  urls.push(url);assert.equal(options.redirect,'manual');
  const u=new URL(url);
  if(u.hostname==='api.worldbank.org')return json(bank);
  if(u.hostname==='comtradeapi.un.org')return json({data:[{
   period:2024,reporterCode:699,partnerCode:0,flowCode:'M',
   cmdCode:'8712',primaryValue:1250000,netWgt:12000,netWgtUnitCode:8
  }]});
  if(u.hostname==='api.gdeltproject.org')return json({articles:[{
   title:'Canyon announces a new road bike category',url:'https://example.org/news/canyon',
   seendate:'20261105T090000Z',domain:'example.org',sourcecountry:'India'
  }]});
  throw Error('unknown host');
 }
 return {fetchImpl,urls};
}
test('official feeds normalize scoped observations and preserve provenance',async()=>{
 const f=fixture();
 const x=await collectMarketPublicEvidence({fetchImpl:f.fetchImpl,now:()=>new Date('2026-11-06T00:00:00Z')});
 assert.equal(x.schemaVersion,'VAOS_MARKET_PUBLIC_EVIDENCE_V1');
 assert.equal(x.worldBank.gdp.status,'OBSERVED');
 assert.equal(x.worldBank.gdp.series.length,10);
 assert.equal(x.comtrade.observations.length,1);
 assert.equal(x.comtrade.observations[0].valueUSD,1250000);
 assert.equal(x.comtrade.scope,'INDIA_IMPORTED_NONMOTORIZED_BICYCLES_HS8712_NOT_FRAMESETS');
 assert.equal(x.competitors.status,'UNVERIFIED_HEADLINE_CONTEXT');
 assert.equal(x.competitors.items.length,3);
 assert.equal(x.demandForecastQualified,false);
 assert.equal(x.actionAuthorized,false);
 assert.ok(f.urls.every(x=>/^https:\/\/(api\.worldbank\.org|comtradeapi\.un\.org|api\.gdeltproject\.org)\//.test(x)));
});
test('wrong-series responses are excluded rather than silently treated as trade totals',async()=>{
 const f=fixture();const original=f.fetchImpl;
 const x=await collectMarketPublicEvidence({fetchImpl:async(url,opt)=>{
  if(url.includes('comtradeapi'))return json({data:[{
   period:2024,reporterCode:156,partnerCode:0,flowCode:'X',cmdCode:'8712',primaryValue:999999
  }]});
  return original(url,opt);
 },now:()=>new Date('2026-11-06T00:00:00Z')});
 assert.equal(x.comtrade.observations.length,0);
 assert.equal(x.comtrade.status,'HOLD');
});
test('malformed responses and source outages fail closed without fabricated facts',async()=>{
 const x=await collectMarketPublicEvidence({fetchImpl:async()=>({ok:true,status:200,headers:{get:()=> 'text/html'},text:async()=>'<html>bad</html>'}),now:()=>new Date('2026-11-06T00:00:00Z')});
 assert.equal(x.worldBank.gdp.status,'HOLD');
 assert.equal(x.comtrade.status,'HOLD');
 assert.equal(x.competitors.status,'HOLD');
 assert.equal(x.actionAuthorized,false);
});
test('external feeds are bounded and never accept arbitrary URLs',async()=>{
 const f=fixture();
 await collectMarketPublicEvidence({fetchImpl:f.fetchImpl,now:()=>new Date('2026-11-06T00:00:00Z')});
 assert.ok(f.urls.length<=8);
 assert.equal(new URL(f.urls.find(u=>u.includes('comtradeapi'))).searchParams.get('reporterCode'),'699');
 assert.ok(f.urls.filter(u=>u.includes('gdeltproject')).every(u=>new URL(u).searchParams.get('maxrecords')==='10'));
});
