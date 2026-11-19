/** Founder-only audit of a NEW server-side A03 signed-read trial.
 * Does not import client-origin source rows or promote authority.
 */
import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {apiError} from '../lib/api-contracts.mjs';
import {featureControl} from '../lib/feature-flags.mjs';
import {createOntologySignedReader} from './ontology-source-status.mjs';
import {runA03SignedReadCanary} from '../../../intelligence/jarvis-a03-read-canary.mjs';
import {saveA03Evidence,readA03Evidence} from '../../../intelligence/jarvis-a03-evidence-archive.mjs';

const FOUNDER='shyamsundhar1982@gmail.com';
export function createJarvisA03EvidenceHandler({
 getSession=req=>verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]),
 getReader=createOntologySignedReader,runTrial=runA03SignedReadCanary,
 save=saveA03Evidence,load=readA03Evidence
}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(!['GET','POST'].includes(req.method)){
   res.setHeader('Allow','GET, POST');
   return res.status(405).json(apiError('METHOD_NOT_ALLOWED','GET receipt or POST capture required'));
  }
  let session;
  try{session=getSession(req);}catch{}
  if(!session)return res.status(401).json(apiError('UNAUTHENTICATED','Founder sign-in required'));
  if(session.email!==FOUNDER)return res.status(403).json(apiError('FOUNDER_ONLY','Founder-only A03 evidence'));
  let url;
  try{url=new URL(req.url);}catch{
   return res.status(422).json(apiError('A03_ARCHIVE_REQUEST_INVALID','Invalid URL'));
  }
  if(req.method==='GET'){
   if([...url.searchParams.keys()].some(k=>k!=='receipt')||
     url.searchParams.getAll('receipt').length!==1)
    return res.status(422).json(apiError('A03_ARCHIVE_RECEIPT_INVALID','One receipt required'));
   try{return res.status(200).json({data:await load({
    bucket:req.env?.VAOS_ARTIFACTS,receipt:url.searchParams.get('receipt')
   })});}
   catch(error){
    if(error?.message==='A03_ARCHIVE_RECEIPT_INVALID')
     return res.status(422).json(apiError('A03_ARCHIVE_RECEIPT_INVALID','Invalid receipt'));
    if(error?.message==='A03_ARCHIVE_NOT_FOUND')
     return res.status(404).json(apiError('A03_ARCHIVE_NOT_FOUND','Receipt not found'));
    return res.status(503).json(apiError('A03_ARCHIVE_UNVERIFIED','Stored receipt unavailable or unverified'));
   }
  }
  // The R2 archive is a separately controlled storage WRITE, not a business WRITE.
  if(featureControl(req.env,'VAOS_A03_ARCHIVE_CONTROL')!=='founder-manual-archive-v1')
   return res.status(409).json(apiError('A03_ARCHIVE_DISABLED','Audit capture awaits free-tier approval'));
  if(req.headers?.origin!==url.origin)
   return res.status(403).json(apiError('ORIGIN_DENIED','Same-origin consent required'));
  if(url.search)
   return res.status(422).json(apiError('A03_ARCHIVE_REQUEST_INVALID','Query parameters forbidden'));
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers?.['content-type']||''))
   return res.status(415).json(apiError('JSON_REQUIRED','JSON required'));
  const body=req.body;
  if(!body||typeof body!=='object'||Array.isArray(body)||
    Object.keys(body).sort().join(',')!=='confirm,operation'||
    body.operation!=='CAPTURE_FRESH_SIGNED_READ'||body.confirm!==true)
   return res.status(422).json(apiError('A03_ARCHIVE_CONSENT_REQUIRED','Explicit fresh signed-read capture consent required'));
  try{
   const report=await runTrial({reader:getReader(req.env)});
   const result=await save({bucket:req.env?.VAOS_ARTIFACTS,report});
   return res.status(200).json({data:result});
  }catch{return res.status(503).json(apiError('A03_ARCHIVE_CAPTURE_HOLD','Fresh signed read or immutable archive unavailable'));}
 };
}
export default createJarvisA03EvidenceHandler();
