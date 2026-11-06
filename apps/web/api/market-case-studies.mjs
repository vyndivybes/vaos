/** Founder-only market study: public headline context, scenario preview and explicit immutable R2 archive.
 * No paid search dependency. News headlines are NOT market evidence certification.
 */
import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {apiError} from '../lib/api-contracts.mjs';
import {parsePublicNewsFeed} from './business-advisor.mjs';
import {qualifyPublicHeadlines} from '../lib/public-research-evidence.mjs';
import {buildMarketCaseStudy,renderMarketCaseStudy} from '../../../intelligence/market-case-study.mjs';

const FOUNDER='shyamsundhar1982@gmail.com';
const PREFIX='jarvis/founder/market-cases/v1/';
const IDENT=/^[A-Z][A-Z0-9-]{5,79}$/;
const VERSION=/^\d{14}-[0-9a-f-]{36}$/;
const RESEARCH=/^[A-Za-z0-9][A-Za-z0-9 ,&.()\/-]{7,119}$/;
const SECRET=/\b(password|passphrase|secret|api.?key|token|credential|private key)\b/i;
const fail=(res,status,code)=>res.status(status).json(apiError(code,code.replace(/_/g,' ')));

async function publicScan(query,fetchImpl,asOf){
 const url='https://news.google.com/rss/search?q='+encodeURIComponent(query)+'&hl=en-IN&gl=IN&ceid=IN:en';
 try{
  const response=await fetchImpl(url,{method:'GET',redirect:'manual',
   headers:{Accept:'application/rss+xml, application/xml'},signal:AbortSignal.timeout(3500)});
  if(!response?.ok||response.status>=300
   ||!/rss|xml/i.test(String(response.headers?.get('content-type')||'')))throw Error('HEADLINE_SOURCE_HOLD');
  const xml=await response.text();
  return qualifyPublicHeadlines(parsePublicNewsFeed(xml),{asOf,days:45});
 }catch{return qualifyPublicHeadlines([],{asOf,days:45})}
}
export function createMarketCaseStudiesHandler({
 getSession=req=>verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]),
 fetchImpl=globalThis.fetch,now=()=>new Date(),uuid=()=>crypto.randomUUID()
}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(!['GET','POST'].includes(req.method))return fail(res,405,'METHOD_NOT_ALLOWED');
  const session=getSession(req);
  if(!session)return fail(res,401,'UNAUTHENTICATED');
  if(session.email!==FOUNDER)return fail(res,403,'FOUNDER_ONLY');
  let params,origin;
  try{const url=new URL(req.url);params=url.searchParams;origin=url.origin}catch{return fail(res,422,'URL_INVALID')}
  const bucket=req.env?.VAOS_ARTIFACTS;
  if(req.method==='GET'){
   const q=params.get('q'),id=params.get('id'),record=params.get('record');
   if(q!==null){
    if([...params.keys()].some(x=>x!=='q')||!RESEARCH.test(q)||SECRET.test(q))
     return fail(res,422,'RESEARCH_QUERY_INVALID');
    const scanned=await publicScan(q,fetchImpl,now().toISOString().slice(0,10));
    return res.status(200).json({data:{query:q,context:scanned,sourceKind:'UNVERIFIED_HEADLINE_CONTEXT',
     verifiedMarketBenchmark:false,forecastQualified:false,actionAuthorized:false}});
   }
   if(!bucket||typeof bucket.get!=='function'||typeof bucket.list!=='function')
    return fail(res,503,'CASE_ARCHIVE_UNAVAILABLE');
   if(id||record){
    if(!IDENT.test(id||'')||!VERSION.test(record||'')||[...params.keys()].some(x=>!['id','record'].includes(x)))
     return fail(res,422,'CASE_REFERENCE_INVALID');
    try{
     const object=await bucket.get(PREFIX+id+'/'+record+'.json');
     if(!object)return fail(res,404,'CASE_NOT_FOUND');
     const saved=await object.json();
     if(saved?.report?.schemaVersion!=='VAOS_MARKET_CASE_STUDY_V1'||saved.report.id!==id
       ||saved.version!==record||typeof saved.markdown!=='string')
       throw Error('CASE_ARCHIVE_INVALID');
     return res.status(200).json({data:saved});
    }catch{return fail(res,503,'CASE_ARCHIVE_READ_HOLD')}
   }
   if(params.size)return fail(res,422,'CASE_QUERY_INVALID');
   try{
    const listed=await bucket.list({prefix:PREFIX,limit:100});
    const records=(listed.objects||[]).map(x=>{
     const match=x.key.slice(PREFIX.length).match(/^([A-Z][A-Z0-9-]{5,79})\/(\d{14}-[0-9a-f-]{36})\.json$/);
     return match?{id:match[1],version:match[2],storedAt:x.uploaded||null}:null;
    }).filter(Boolean);
    return res.status(200).json({data:{records,partial:listed.truncated===true,readOnly:true}});
   }catch{return fail(res,503,'CASE_ARCHIVE_LIST_HOLD')}
  }
  // Mutating archive requests must be same-origin JSON with explicit SAVE consent.
  if(req.headers?.origin!==origin)return fail(res,403,'ORIGIN_DENIED');
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers?.['content-type']||''))
   return fail(res,415,'JSON_REQUIRED');
  const body=req.body;
  if(!body||typeof body!=='object'||Array.isArray(body)||JSON.stringify(body).length>40000
   ||!['PREVIEW','SAVE'].includes(body.operation)||!body.case)
   return fail(res,422,'CASE_INPUT_INVALID');
  if(body.operation==='SAVE'&&body.confirm!==true)return fail(res,400,'ARCHIVE_CONSENT_REQUIRED');
  let report,markdown;
  try{report=buildMarketCaseStudy(body.case);markdown=renderMarketCaseStudy(report)}
  catch{return fail(res,422,'CASE_INPUT_INVALID')}
  if(body.operation==='PREVIEW')
   return res.status(200).json({data:{report,markdown,persisted:false,version:null}});
  if(!bucket||typeof bucket.put!=='function')return fail(res,503,'CASE_ARCHIVE_UNAVAILABLE');
  const version=now().toISOString().replace(/[-:.TZ]/g,'').slice(0,14)+'-'+uuid();
  if(!VERSION.test(version))return fail(res,503,'CASE_VERSION_INVALID');
  const saved={schemaVersion:'VAOS_MARKET_CASE_ARCHIVE_V1',version,storedAt:now().toISOString(),
   report,markdown,sourceState:'USER_SUPPLIED_UNVERIFIED',actionAuthorized:false};
  try{
   await bucket.put(PREFIX+report.id+'/'+version+'.json',JSON.stringify(saved),
    {onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});
  }catch{return fail(res,503,'CASE_ARCHIVE_WRITE_HOLD')}
  return res.status(201).json({data:{id:report.id,version,persisted:true,sourceState:saved.sourceState,
    actionAuthorized:false}});
 };
}
export default createMarketCaseStudiesHandler();
