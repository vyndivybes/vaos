import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {apiError} from '../lib/api-contracts.mjs';
import {classifyVoiceQuestion,claimVoiceAiDailyBudget} from '../lib/voice-ai-focus.mjs';
import {isReadOnlyMissionStatusQuestion} from '../lib/voice-pilot.mjs';
const FOUNDER='shyamsundhar1982@gmail.com';
const TOPICS=new Set(['status','verification','blockers','evidence','closure']);
const FLAGS=Object.freeze({
 VAOS_VOICE_CONTROL:'founder-readonly-browser-v1',
 VAOS_VOICE_CONVERSATION_CONTROL:'founder-readonly-one-shot-v1',
 VAOS_VOICE_MULTITURN_CONTROL:'founder-readonly-multiturn-v1',
 VAOS_VOICE_AI_CONTROL:'founder-readonly-ai-focus-v1',
});
function isValid(body){
 if(!body||typeof body!=='object'||Array.isArray(body)
  ||Object.keys(body).length!==2||!Object.hasOwn(body,'question')||!Object.hasOwn(body,'priorTopics')
  ||!isReadOnlyMissionStatusQuestion(body.question)
  ||!Array.isArray(body.priorTopics)||body.priorTopics.length>2
  ||body.priorTopics.some(x=>typeof x!=='string'||!TOPICS.has(x)))return false;
 return true;
}
// This endpoint does NOT retrieve mission data, store transcripts, run tools,
// create business records, or produce model-generated facts. A single model
// may classify one pre-validated question only after a durable daily quota claim.
export function createVoiceAiFocusHandler({
 claim=claimVoiceAiDailyBudget,
 classify=classifyVoiceQuestion,
}={}){
 return async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json(apiError('METHOD_NOT_ALLOWED','POST required'));}
  const session=verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]);
  if(!session)return res.status(401).json(apiError('UNAUTHENTICATED','Founder session required'));
  if(session.email!==FOUNDER)return res.status(403).json(apiError('FOUNDER_ONLY','Founder identity required'));
  if(Object.entries(FLAGS).some(([key,val])=>req.env?.[key]!==val))
   return res.status(409).json(apiError('VOICE_AI_DISABLED','Read-only AI focus pilot disabled'));
  let origin=null;try{origin=new URL(req.url).origin;}catch{}
  if(!origin||req.headers?.origin!==origin)
   return res.status(403).json(apiError('ORIGIN_DENIED','Same origin required'));
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers?.['content-type']||''))
   return res.status(415).json(apiError('CONTENT_TYPE_DENIED','JSON required'));
  if(!isValid(req.body))return res.status(422).json(apiError('VOICE_AI_QUESTION_INVALID','Read-only question or context invalid'));
  if(typeof req.env?.AI?.run!=='function'||!req.env?.VAOS_ARTIFACTS)
   return res.status(503).json(apiError('VOICE_AI_UNAVAILABLE','Model or durable budget unavailable'));
  let quota;try{quota=await claim(req.env.VAOS_ARTIFACTS);}catch{
   return res.status(503).json(apiError('VOICE_AI_QUOTA_UNAVAILABLE','Durable inference quota unavailable'));
  }
  if(quota?.allowed===false)return res.status(429).json(apiError('VOICE_AI_DAILY_CAP','Daily AI voice limit reached; use deterministic Stage V3'));
  if(quota?.allowed!==true||!Number.isInteger(quota.remaining)||quota.remaining<0||quota.remaining>2)
   return res.status(503).json(apiError('VOICE_AI_QUOTA_UNVERIFIED','Inference quota unverified'));
  try{
   const result=await classify({ai:req.env.AI,question:req.body.question,priorTopics:req.body.priorTopics});
   if(!result?.modelInvoked||result.actionAuthorized!==false||!Array.isArray(result.topics)
       ||result.topics.length<1||result.topics.length>5
       ||result.topics.some(t=>!TOPICS.has(t))||new Set(result.topics).size!==result.topics.length)
    throw Error('VOICE_AI_CLASSIFICATION_REJECTED');
   return res.status(200).json({data:{topics:result.topics,modelInvoked:true,actionAuthorized:false,remainingDaily:quota.remaining}});
  }catch{
   return res.status(503).json(apiError('VOICE_AI_INFERENCE_UNAVAILABLE','Bounded read-only model classification failed'));
  }
 };
}
export default createVoiceAiFocusHandler();
