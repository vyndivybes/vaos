import crypto from 'node:crypto';
import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {apiError} from '../lib/api-contracts.mjs';
import {getFounderInboxStore} from '../lib/founder-inbox-provider.mjs';
import {getFounderChatStore} from '../lib/founder-chat-provider.mjs';
import {getEightAgentOperatingService} from '../lib/operating-provider.mjs';
import {prepareFounderMissionReport} from '../lib/founder-report-preview.mjs';
import {runFounderAiDraft,FOUNDER_AI_MODEL} from '../lib/founder-ai-draft.mjs';
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MISSION=/^[a-zA-Z0-9][a-zA-Z0-9._:-]{3,95}$/;
function valid(b){return b&&typeof b==='object'&&!Array.isArray(b)
 &&Object.keys(b).length===4
 &&Object.keys(b).every(k=>['operation','agentId','messageId','missionId'].includes(k))
 &&b.operation==='GENERATE_READONLY_DRAFT'
 &&['project','orchestrator'].includes(b.agentId)
 &&typeof b.messageId==='string'&&ID.test(b.messageId)
 &&typeof b.missionId==='string'&&MISSION.test(b.missionId);}
function replyValid(reply,messageId,agentId,missionId){
 return reply?.messageId===messageId&&reply?.agentId===agentId
 &&reply?.missionId===missionId&&reply?.status==='AI_DRAFT_UNVERIFIED'
 &&reply?.model===FOUNDER_AI_MODEL
 &&typeof reply.content==='string'&&reply.content.length>=10&&reply.content.length<=1200
 &&Array.isArray(reply.evidenceRefs)&&reply.evidenceRefs.length<=20;
}
export function createFounderChatHandler({getInbox=getFounderInboxStore,
 getReplies=getFounderChatStore,getMission=getEightAgentOperatingService,
 runAi=runFounderAiDraft}={}){
 return async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='POST'){res.setHeader('Allow','POST');
   return res.status(405).json(apiError('METHOD_NOT_ALLOWED','POST required'));}
  const token=parseCookies(req.headers?.cookie||'')[SESSION_COOKIE];
  const session=verifySessionToken(token);
  if(!session)return res.status(401).json(apiError('UNAUTHENTICATED','Sign in required'));
  if(session.email!=='shyamsundhar1982@gmail.com')
   return res.status(403).json(apiError('FOUNDER_ONLY','Founder identity required'));
  if(req.env?.VAOS_FOUNDER_INBOX_CONTROL!=='record-only-v1'
     ||req.env?.VAOS_FOUNDER_AGENT_REPORT_CONTROL!=='preview-only-v1'
     ||req.env?.VAOS_FOUNDER_CHAT_CONTROL!=='qualified-readonly-v1')
   return res.status(409).json(apiError('FOUNDER_CHAT_DISABLED','Conversation pilot not commissioned'));
  let origin;try{origin=new URL(req.url).origin;}catch{origin=null;}
  if(!origin||req.headers?.origin!==origin)
   return res.status(403).json(apiError('ORIGIN_DENIED','Same-origin request required'));
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers?.['content-type']||''))
   return res.status(415).json(apiError('CONTENT_TYPE_DENIED','JSON required'));
  if(!valid(req.body))return res.status(422).json(apiError('VALIDATION_ERROR','Read-only draft request invalid'));
  const {agentId,messageId,missionId}=req.body;
  let record;let store;let existing;
  try{
   const items=await getInbox(req.env).list({actorEmail:session.email,agentId});
   if(!Array.isArray(items?.messages))throw Error();
   record=items.messages.find(m=>m?.messageId===messageId);
   if(!record||record.kind!=='REPORT_REQUEST'||record.status!=='RECORDED_NOT_ROUTED'
      ||record.recipientAgentId!==agentId
      ||typeof record.instruction!=='string'||!record.instruction.includes(missionId))return res.status(409).json(apiError('FOUNDER_CHAT_RECORD_UNVERIFIED','Persisted report request required'));
   store=getReplies(req.env);
   existing=await store.get({messageId,agentId,actorEmail:session.email});
   if(existing?.reply){
    if(!replyValid(existing.reply,messageId,agentId,missionId))
     return res.status(409).json(apiError('FOUNDER_CHAT_MISSION_CONFLICT','Draft already belongs to another mission or model'));
    return res.status(200).json({data:{reply:existing.reply,outcome:'REPLAY',modelInvoked:false,actionAuthorized:false}});
   }
  }catch{return res.status(503).json(apiError('FOUNDER_CHAT_STORAGE_UNAVAILABLE','Recorded request or draft storage unavailable'));}
  let report;
  try{
   const snapshot=await getMission(req.env).snapshot(missionId);
   report=prepareFounderMissionReport({record,agentId,messageId,missionId,snapshot});
   if(report.evidenceRefs.length>20)throw Error();
  }catch{return res.status(503).json(apiError('FOUNDER_CHAT_EVIDENCE_UNAVAILABLE','Mission evidence could not be confirmed'));}
  // Atomic one-time claim is acquired BEFORE billable inference. No blind retries.
  let claimed;
  try{claimed=await store.claim({messageId,agentId,missionId,actorEmail:session.email});}
  catch{return res.status(503).json(apiError('FOUNDER_CHAT_CLAIM_UNAVAILABLE','Inference claim unavailable'));}
  if(claimed?.outcome==='RATE_LIMITED')
   return res.status(429).json(apiError('FOUNDER_CHAT_RATE_LIMITED','Founder AI claim limit reached'));
  if(claimed?.outcome!=='CLAIMED')
   return res.status(409).json(apiError('FOUNDER_CHAT_ALREADY_CLAIMED','Request already claimed; no retry without a new recorded message'));
  let draft;
  try{
   draft=await runAi({ai:req.env?.AI,agentId,instruction:record.instruction,report});
   if(draft?.status!=='AI_DRAFT_UNVERIFIED'||draft.model!==FOUNDER_AI_MODEL
       ||draft.actionAuthorized!==false||typeof draft.content!=='string'
       ||draft.content.length>1200)throw Error();
  }catch{return res.status(503).json(apiError('FOUNDER_CHAT_INFERENCE_UNAVAILABLE','Read-only AI draft could not be independently grounded'));}
  try{
   const sourceHash=crypto.createHash('sha256').update(JSON.stringify(report)).digest('hex');
   const saved=await store.append({messageId,agentId,missionId,actorEmail:session.email,
    content:draft.content,sourceHash,evidenceRefs:report.evidenceRefs});
   if(!['RECORDED','REPLAY'].includes(saved?.outcome)
      ||!replyValid(saved.reply,messageId,agentId,missionId))throw Error();
   return res.status(saved.outcome==='RECORDED'?201:200).json({data:{
    outcome:saved.outcome,reply:saved.reply,modelInvoked:saved.outcome==='RECORDED',actionAuthorized:false}});
  }catch{return res.status(503).json(apiError('FOUNDER_CHAT_STORAGE_UNAVAILABLE','Draft persistence not verified; do not claim delivery'));}
 };
}
export default createFounderChatHandler();
