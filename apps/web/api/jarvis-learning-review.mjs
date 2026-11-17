import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {apiError} from '../lib/api-contracts.mjs';
import {evaluateJarvisPairs} from '../../../intelligence/jarvis-evaluation.mjs';
import {saveLearningReview,readLearningReview} from '../../../intelligence/jarvis-learning-ledger.mjs';

export function createJarvisLearningReviewHandler() {
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(!['POST','GET'].includes(req.method)){
   res.setHeader('Allow','POST, GET');
   return res.status(405).json(apiError('METHOD_NOT_ALLOWED','POST review or GET receipt required'));
  }
  const session=verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]);
  if(!session)return res.status(401).json(apiError('UNAUTHENTICATED','Founder sign-in required'));
  if(session.email!=='shyamsundhar1982@gmail.com')return res.status(403).json(apiError('FOUNDER_ONLY','Founder-only learning review'));
  let url;try{url=new URL(req.url);}catch{return res.status(403).json(apiError('ORIGIN_DENIED','Valid review URL required'));}
  if(req.method==='GET'){
   if([...url.searchParams.keys()].some(k=>k!=='receipt')||url.searchParams.getAll('receipt').length!==1)
    return res.status(422).json(apiError('LEARNING_RECEIPT_INVALID','One exact receipt is required'));
   try{
    const data=await readLearningReview({bucket:req.env?.VAOS_ARTIFACTS,receipt:url.searchParams.get('receipt')});
    return res.status(200).json({data});
   }catch(error){
    if(error?.message==='LEARNING_RECEIPT_INVALID')return res.status(422).json(apiError('LEARNING_RECEIPT_INVALID','Invalid receipt'));
    if(error?.message==='LEARNING_RECEIPT_NOT_FOUND')return res.status(404).json(apiError('LEARNING_RECEIPT_NOT_FOUND','Review receipt not found'));
    return res.status(503).json(apiError('LEARNING_ARCHIVE_UNAVAILABLE','Learning review archive unavailable'));
   }
  }
  if(req.headers?.origin!==url.origin)return res.status(403).json(apiError('ORIGIN_DENIED','Same-origin review required'));
  if(url.search)return res.status(422).json(apiError('VALIDATION_ERROR','No query parameters accepted for POST'));
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers?.['content-type']||''))return res.status(415).json(apiError('JSON_REQUIRED','JSON review required'));
  let input,save=false,data;
  try{
   const bytes=typeof req.body==='string'?req.body:JSON.stringify(req.body);
   if(typeof bytes!=='string'||new TextEncoder().encode(bytes).length>262144)return res.status(413).json(apiError('REVIEW_TOO_LARGE','Review must be at most 256 KiB'));
   input=typeof req.body==='string'?JSON.parse(req.body):req.body;
   if(input&&typeof input==='object'&&input.operation==='SAVE'){
    if(Object.keys(input).sort().join(',')!=='batch,confirm,operation'||input.confirm!==true)
     return res.status(422).json(apiError('LEARNING_CONSENT_REQUIRED','Explicit archive consent required'));
    save=true;input=input.batch;
   }
   data=evaluateJarvisPairs(input);
  }catch{
   return res.status(422).json(apiError('REVIEW_HOLD','Invalid paired outcomes; raw questions, answers and source documents are not accepted'));
  }
  if(!save)return res.status(200).json({data:{...data,stored:false,policyChangesAuthorized:false,
   reviewAuthority:'CLIENT_DECLARED_OUTCOMES_UNVERIFIED'}});
  try{
   const receipt=await saveLearningReview({bucket:req.env?.VAOS_ARTIFACTS,batch:input,summary:data});
   return res.status(200).json({data:{...data,...receipt,
    reviewAuthority:'CLIENT_DECLARED_OUTCOMES_UNVERIFIED'}});
  }catch{
   return res.status(503).json(apiError('LEARNING_ARCHIVE_UNAVAILABLE','The consented aggregate review could not be archived'));
  }
 };
}
export default createJarvisLearningReviewHandler();
