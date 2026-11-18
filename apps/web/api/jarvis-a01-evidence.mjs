/** Founder-only, explicitly consented A01 archive. Disabled by default to avoid cost.
 * Captures a NEW server-side signed A01 result; never trusts client-supplied reports.
 */
import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {apiError} from '../lib/api-contracts.mjs';
import {featureControl} from '../lib/feature-flags.mjs';
import {createJarvisA01Handler} from './jarvis-a01.mjs';
import {saveA01Evidence,readA01Evidence} from '../../../intelligence/jarvis-a01-evidence-archive.mjs';

const FOUNDER='shyamsundhar1982@gmail.com';
async function liveA01({req}){
 const handle=createJarvisA01Handler();
 let status=200,payload=null;
 const shim={setHeader(){return shim},status(n){status=n;return shim},
  json(x){payload=x;return shim}};
 await handle({method:'GET',url:new URL('/api/jarvis-a01',req.url).toString(),
  headers:req.headers,env:req.env},shim);
 if(status!==200||!payload?.data)throw Error('A01_SIGNED_SOURCE_UNAVAILABLE');
 return payload.data;
}
export function createJarvisA01EvidenceHandler({
 readA01=liveA01,save=saveA01Evidence,load=readA01Evidence
}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(!['GET','POST'].includes(req.method)){
   res.setHeader('Allow','GET, POST');
   return res.status(405).json(apiError('METHOD_NOT_ALLOWED','GET receipt or POST capture required'));
  }
  const session=verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]);
  if(!session)return res.status(401).json(apiError('UNAUTHENTICATED','Founder sign-in required'));
  if(session.email!==FOUNDER)return res.status(403).json(apiError('FOUNDER_ONLY','Founder-only A01 evidence'));
  let url;try{url=new URL(req.url);}catch{
   return res.status(422).json(apiError('A01_ARCHIVE_REQUEST_INVALID','Invalid URL'));
  }
  if(req.method==='GET'){
   if([...url.searchParams.keys()].some(k=>k!=='receipt')||url.searchParams.getAll('receipt').length!==1)
    return res.status(422).json(apiError('A01_ARCHIVE_RECEIPT_INVALID','One receipt required'));
   try{return res.status(200).json({data:await load({bucket:req.env?.VAOS_ARTIFACTS,
    receipt:url.searchParams.get('receipt')})});}
   catch(error){
    if(error?.message==='A01_ARCHIVE_RECEIPT_INVALID')return res.status(422).json(apiError('A01_ARCHIVE_RECEIPT_INVALID','Invalid receipt'));
    if(error?.message==='A01_ARCHIVE_NOT_FOUND')return res.status(404).json(apiError('A01_ARCHIVE_NOT_FOUND','Receipt not found'));
    return res.status(503).json(apiError('A01_ARCHIVE_UNAVAILABLE','Stored evidence unavailable or unverified'));
   }
  }
  if(featureControl(req.env,'VAOS_A01_ARCHIVE_CONTROL')!=='founder-manual-archive-v1')
   return res.status(409).json(apiError('A01_ARCHIVE_DISABLED','Archive disabled pending zero-cost qualification'));
  if(req.headers?.origin!==url.origin)return res.status(403).json(apiError('ORIGIN_DENIED','Same-origin capture required'));
  if(url.search)return res.status(422).json(apiError('A01_ARCHIVE_REQUEST_INVALID','No query parameters allowed'));
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers?.['content-type']||''))
   return res.status(415).json(apiError('JSON_REQUIRED','JSON required'));
  const body=req.body;
  if(!body||typeof body!=='object'||Array.isArray(body)||
   Object.keys(body).sort().join(',')!=='confirm,operation'||
   body.operation!=='CAPTURE'||body.confirm!==true)
   return res.status(422).json(apiError('A01_ARCHIVE_CONSENT_REQUIRED','Exact founder capture consent required'));
  try{
   const report=await readA01({req});
   const result=await save({bucket:req.env?.VAOS_ARTIFACTS,report});
   return res.status(200).json({data:result});
  }catch{
   return res.status(503).json(apiError('A01_ARCHIVE_CAPTURE_HOLD','Signed A01 or immutable evidence storage unavailable'));
  }
 };
}
export default createJarvisA01EvidenceHandler();
