/** Public-data adapters for founder-only market intelligence.
 * Fixed official URLs; no user-supplied fetch URL, API key, mutation or pay-per-call provider.
 * Observations keep scope, units, year, host provenance and explicit qualification HOLD.
 */
const WB='https://api.worldbank.org/v2/country/IND/indicator/';
const CT='https://comtradeapi.un.org/public/v1/preview/C/A/HS';
const GD='https://api.gdeltproject.org/api/v2/doc/doc';
const WATCH=Object.freeze([
 {id:'trek',name:'Trek Bicycle',query:'"Trek Bicycle"'},
 {id:'giant',name:'Giant Bicycles',query:'"Giant Bicycles"'},
 {id:'canyon',name:'Canyon Bicycles',query:'"Canyon Bicycles"'}
]);
const safe=(s,max=180)=>typeof s==='string'?s.replace(/[\u0000-\u001f\u007f<>]/g,' ').trim().slice(0,max):'';
const validYear=n=>Number.isInteger(n)&&n>=2000&&n<=2100;
function asHttps(url){
 try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password&&u.hostname.includes('.')?u.href:null}
 catch{return null}
}
async function readJSON(url,fetchImpl){
 const allowed=new Set(['api.worldbank.org','comtradeapi.un.org','api.gdeltproject.org']);
 const parsed=new URL(url);
 if(parsed.protocol!=='https:'||!allowed.has(parsed.hostname)||parsed.port||parsed.username||parsed.password)throw Error('MARKET_SOURCE_URL_HOLD');
 const response=await fetchImpl(url,{method:'GET',redirect:'manual',headers:{Accept:'application/json'},signal:AbortSignal.timeout(4500)});
 if(!response?.ok||response.status>=300||!/json/i.test(String(response.headers?.get('content-type')||'')))throw Error('MARKET_SOURCE_HTTP_HOLD');
 const raw=await response.text();
 if(raw.length>220000)throw Error('MARKET_SOURCE_SIZE_HOLD');
 return JSON.parse(raw);
}
function parseBank(data,code,label,url){
 const hold={status:'HOLD',source:'WORLD_BANK_V2',indicator:code,label,unit:'PERCENT_ANNUAL',url,series:[],reason:'SOURCE_UNAVAILABLE_OR_UNMATCHED'};
 if(!Array.isArray(data)||!Array.isArray(data[1]))return hold;
 const years=new Map();
 for(const r of data[1]){
  const year=Number(r?.date),value=r?.value;
  if(!validYear(year)||!Number.isFinite(value)||Math.abs(value)>1e6||
    r?.countryiso3code!=='IND'||r?.indicator?.id!==code)continue;
  if(!years.has(year))years.set(year,{year,value,observedFrom:'WORLD_BANK_INDICATOR_API',unit:'PERCENT_ANNUAL'});
 }
 const series=[...years.values()].sort((a,b)=>a.year-b.year).slice(-12);
 return {...hold,status:series.length?'OBSERVED':'HOLD',series,
  reason:series.length?null:'SOURCE_UNAVAILABLE_OR_UNMATCHED'};
}
function parseComtrade(raw,requestedYear,url){
 const observations=[];
 for(const r of Array.isArray(raw?.data)?raw.data:[]){
  const year=Number(r?.period??r?.refYear);
  if(year!==requestedYear||Number(r?.reporterCode)!==699||Number(r?.partnerCode)!==0||
   r?.flowCode!=='M'||String(r?.cmdCode)!=='8712'||!Number.isFinite(r?.primaryValue)||r.primaryValue<0)continue;
  observations.push({year,valueUSD:r.primaryValue,unit:'CURRENT_USD',reporter:'INDIA',
   commodity:'HS_8712',tradeFlow:'IMPORT',partner:'WORLD',sourceUrl:url});
 }
 return observations.length===1?observations[0]:null;
}
function parseArticles(raw,asOf){
 const list=Array.isArray(raw?.articles)?raw.articles:[];
 const result=[],seen=new Set();
 for(const a of list.slice(0,20)){
  const url=asHttps(a?.url),title=safe(a?.title,180);
  if(!url||title.length<8||seen.has(url))continue;
  const day=typeof a?.seendate==='string'&&/^\d{8}T\d{6}Z$/.test(a.seendate)?
   a.seendate.slice(0,4)+'-'+a.seendate.slice(4,6)+'-'+a.seendate.slice(6,8):null;
  if(!day||day>asOf||Date.parse(asOf+'T00:00:00Z')-Date.parse(day+'T00:00:00Z')>8*86400000)continue;
  const watch=WATCH.find(w=>{
   const matches=new RegExp('\\b'+w.id+'\\b','i').test(title);
   return matches&&(w.id!=='giant'||/bicycle|bike|cycling/i.test(title));
  });
  if(!watch)continue;
  seen.add(url);
  result.push({watchId:watch.id,watchName:watch.name,title,url,date:day,
   publisher:safe(a?.domain,100)||'Source unverified',
   evidenceClass:'UNVERIFIED_NEWS_ARTICLE',supplierPriceVerified:false});
  if(result.length===15)break;
 }
 return result;
}
export async function collectMarketPublicEvidence({fetchImpl=globalThis.fetch,now=()=>new Date()}={}){
 const at=now().toISOString(),asOf=at.slice(0,10);
 const bankCodes=[['gdp','NY.GDP.MKTP.KD.ZG','India real GDP growth'],['inflation','FP.CPI.TOTL.ZG','India consumer price inflation']];
 const bankResults=await Promise.all(bankCodes.map(async ([key,code,label])=>{
  const url=WB+code+'?format=json&per_page=20&mrv=12';
  try{return [key,parseBank(await readJSON(url,fetchImpl),code,label,url)]}
  catch{return [key,parseBank(null,code,label,url)]}
 }));
 const periods=[Number(asOf.slice(0,4))-3,Number(asOf.slice(0,4))-2,Number(asOf.slice(0,4))-1];
 const trades=await Promise.all(periods.map(async year=>{
  const url=CT+'?'+new URLSearchParams({period:String(year),reporterCode:'699',partnerCode:'0',cmdCode:'8712',flowCode:'M'}).toString();
  try{return parseComtrade(await readJSON(url,fetchImpl),year,url)}catch{return null}
 }));
 const gdeltUrl=GD+'?'+new URLSearchParams({
  query:WATCH.map(w=>w.query).join(' OR '),mode:'artlist',format:'json',
  maxrecords:'30',timespan:'7d',sort:'datedesc'
 }).toString();
 let items=[];
 try{items=parseArticles(await readJSON(gdeltUrl,fetchImpl),asOf)}catch{items=[]}
 const observations=trades.filter(Boolean);
 const seen=new Set(),deduplicated=items.filter(x=>{
  const key=x.watchId+':'+x.url;
  if(seen.has(key))return false;seen.add(key);return true;
 });
 return {
  schemaVersion:'VAOS_MARKET_PUBLIC_EVIDENCE_V1',collectedAt:at,
  worldBank:Object.fromEntries(bankResults),
  comtrade:{status:observations.length?'OBSERVED':'HOLD',source:'UN_COMTRADE_PUBLIC_PREVIEW',
   scope:'INDIA_IMPORTED_NONMOTORIZED_BICYCLES_HS8712_NOT_FRAMESETS',
   limitations:'Preview may be incomplete. HS 8712 combines non-motorized bicycles; it is not carbon frameset production, sales, or tariff-paid landed pricing.',
   observations},
  competitors:{status:deduplicated.length?'UNVERIFIED_HEADLINE_CONTEXT':'HOLD',
   provider:'GDELT_DOC_2',watchlist:WATCH.map(x=>({id:x.id,name:x.name})),
   items:deduplicated,priceVerified:false,marketShareVerified:false,
   limitations:'Keyword matches are not competitor press releases, confirmed product pricing, revenue or verified allegations.'},
  demandForecastQualified:false,marketSizeQualified:false,actionAuthorized:false,
  pricingVerified:false,readOnly:true,
  sourceQualification:'UPSTREAM_RECORDS_NOT_INDEPENDENTLY_RECONCILED'
 };
}
