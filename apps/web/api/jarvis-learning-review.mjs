import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {apiError} from '../lib/api-contracts.mjs';
import {evaluateJarvisPairs} from '../../../intelligence/jarvis-evaluation.mjs';

export function createJarvisLearningReviewHandler() {
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json(apiError('METHOD_NOT_ALLOWED','POST required'));}
  const session=verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]);
  if(!session)return res.status(401).json(apiError('UNAUTHENTICATED','Founder sign-in required'));
  if(session.email!=='shyamsundhar1982@gmail.com')return res.status(403).json(apiError('FOUNDER_ONLY','Founder-only learning review'));
  let url;try{url=new URL(req.url);}catch{return res.status(403).json(apiError('ORIGIN_DENIED','Same-origin review required'));}
  if(req.headers?.origin!==url.origin)return res.status(403).json(apiError('ORIGIN_DENIED','Same-origin review required'));
  if(url.search)return res.status(422).json(apiError('VALIDATION_ERROR','No query parameters accepted'));
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers?.['content-type']||''))return res.status(415).json(apiError('JSON_REQUIRED','JSON review required'));
  try{
   const bytes=typeof req.body==='string'?req.body:JSON.stringify(req.body);
   if(typeof bytes!=='string'||new TextEncoder().encode(bytes).length>262144)return res.status(413).json(apiError('REVIEW_TOO_LARGE','Review must be at most 256 KiB'));
   const batch=typeof req.body==='string'?JSON.parse(req.body):req.body;
   const data=evaluateJarvisPairs(batch);
   return res.status(200).json({data:{...data,stored:false,policyChangesAuthorized:false,
    reviewAuthority:'CLIENT_DECLARED_OUTCOMES_UNVERIFIED'}});
  }catch{
   return res.status(422).json(apiError('REVIEW_HOLD','Invalid paired outcomes; raw questions, answers and source documents are not accepted'));
  }
 };
}
export default createJarvisLearningReviewHandler();
