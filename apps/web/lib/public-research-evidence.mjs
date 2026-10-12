/** Public headline provenance screening.
 * This is external context only, NEVER independently verified supplier pricing,
 * a statistically representative benchmark, or evidence of market share.
 */
const NEWS=/^https:\/\/news\.google\.com\/rss\/articles\/[A-Za-z0-9_-]{3,220}$/;
function publisherName(value){
 if(typeof value!=='string'||value.length<3||value.length>100
    ||/[<>\u0000-\u001f]/.test(value)||!/^[\p{L}\p{N} &._'-]+$/u.test(value))
  return 'Source unverified';
 return value.trim().slice(0,75)||'Source unverified';
}
export function qualifyPublicHeadlines(items,{asOf=new Date().toISOString().slice(0,10),days=45}={}){
 const invalid=()=>({status:'PUBLIC_EVIDENCE_UNAVAILABLE',items:[],excluded:Array.isArray(items)?items.length:0,
  publishers:[],verifiedMarketBenchmark:false,verifiedSupplierPrice:false,
  evidenceClass:'UNVERIFIED_HEADLINE_CONTEXT'});
 if(!Array.isArray(items)||items.length>25||items.length<1||!/^20\d\d-[01]\d-[0-3]\d$/.test(asOf)
   ||!Number.isInteger(days)||days<1||days>60)return invalid();
 const min=Date.parse(asOf+'T00:00:00Z')-days*86400000;
 const max=Date.parse(asOf+'T23:59:59Z');
 if(!Number.isFinite(min)||!Number.isFinite(max))return invalid();
 const selected=[],seen=new Set();
 for(const it of items){
  if(!it||typeof it.title!=='string'||it.title.length<8||it.title.length>230
    ||typeof it.url!=='string'||!NEWS.test(it.url))continue;
  const date=typeof it.published==='string'?Date.parse(it.published):NaN;
  if(!Number.isFinite(date)||date<min||date>max)continue;
  const dedupe=it.title.normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
  if(seen.has(dedupe))continue;
  seen.add(dedupe);
  selected.push({title:it.title.trim(),url:it.url,published:new Date(date).toISOString(),
    publisher:publisherName(it.publisher)});
  if(selected.length>=3)break;
 }
 const publishers=[...new Set(selected.map(x=>x.publisher))];
 return {status:selected.length===0?'PUBLIC_EVIDENCE_UNAVAILABLE':
   selected.length===1?'SINGLE_HEADLINE_UNVERIFIED':
    publishers.length>1?'MULTI_PUBLISHER_HEADLINES':'SINGLE_PUBLISHER_HEADLINES',
  items:selected,excluded:items.length-selected.length,publishers,
  verifiedMarketBenchmark:false,verifiedSupplierPrice:false,
  evidenceClass:'UNVERIFIED_HEADLINE_CONTEXT'};
}
