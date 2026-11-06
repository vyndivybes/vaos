/** Read-side founder-only official market evidence and bounded manual refresh.
 * No market source URL, competitor, credential, purchase or financial write accepted.
 */
import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {apiError} from '../lib/api-contracts.mjs';
import {refreshMarketIntelligence,LATEST_KEY} from '../../../intelligence/market-monitoring.mjs';
const FOUNDER='shyamsundhar1982@gmail.com';
const fail=(res,status,code)=>res.status(status).json(apiError(code,code.replace(/_/g,' ')));
export function createMarketPublicIntelligenceHandler({
 getSession=req=>verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]),
 fetchImpl=globalThis.fetch,now=()=>new Date(),collect
}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(!['GET','POST'].includes(req.method))return fail(res,405,'METHOD_NOT_ALLOWED');
  const session=getSession(req);
  if(!session)return fail(res,401,'UNAUTHENTICATED');
  if(session.email!==FOUNDER)return fail(res,403,'FOUNDER_ONLY');
  let url;
  try{url=new URL(req.url)}catch{return fail(res,422,'URL_INVALID')}
  if(url.search)return fail(res,422,'QUERY_NOT_SUPPORTED');
  const bucket=req.env?.VAOS_ARTIFACTS;
  if(!bucket||typeof bucket.get!=='function'||typeof bucket.put!=='function')
   return fail(res,503,'MARKET_ARCHIVE_UNAVAILABLE');
  if(req.method==='GET'){
   try{
    const object=await bucket.get(LATEST_KEY);
    if(!object)return fail(res,404,'MARKET_SNAPSHOT_NOT_READY');
    const snapshot=await object.json();
    if(snapshot?.schemaVersion!=='VAOS_PUBLIC_MARKET_SNAPSHOT_V2'||snapshot.actionAuthorized!==false)
     throw Error('MARKET_SNAPSHOT_INVALID');
    return res.status(200).json({data:{snapshot,readOnly:true}});
   }catch{return fail(res,503,'MARKET_ARCHIVE_READ_HOLD')}
  }
  if(req.headers?.origin!==url.origin)return fail(res,403,'ORIGIN_DENIED');
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers?.['content-type']||''))
   return fail(res,415,'JSON_REQUIRED');
  const body=req.body;
  if(!body||typeof body!=='object'||Array.isArray(body)||
   Object.keys(body).some(key=>!['operation','confirm'].includes(key))||body.operation!=='REFRESH')
   return fail(res,422,'REFRESH_REQUEST_INVALID');
  if(body.confirm!==true)return fail(res,400,'REFRESH_CONSENT_REQUIRED');
  try{
   const snapshot=await refreshMarketIntelligence({bucket,fetchImpl,collect,now});
   return res.status(200).json({data:{snapshot,readOnly:true,persisted:true}});
  }catch(error){
   const code=['MARKET_FEEDS_UNAVAILABLE','MARKET_ARCHIVE_READ_HOLD',
    'MARKET_EVIDENCE_INVALID'].includes(error?.message)?error.message:'MARKET_REFRESH_HOLD';
   return fail(res,503,code);
  }
 };
}
export default createMarketPublicIntelligenceHandler();
