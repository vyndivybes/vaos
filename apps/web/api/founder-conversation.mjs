import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {apiError} from '../lib/api-contracts.mjs';
import {getFounderInboxStore} from '../lib/founder-inbox-provider.mjs';
import {getFounderConversationStore} from '../lib/founder-conversation-provider.mjs';
const FOUNDER='shyamsundhar1982@gmail.com';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MISSION=/^[a-zA-Z0-9][a-zA-Z0-9._:-]{3,95}$/;
const AGENTS=new Set(['project','orchestrator']);
function validMission(agentId,missionId){return AGENTS.has(agentId)&&typeof missionId==='string'&&MISSION.test(missionId);}
function validBody(x){return x&&typeof x==='object'&&!Array.isArray(x)
 &&Object.keys(x).length===5
 &&['threadId','messageId','agentId','missionId','instruction'].every(k=>Object.hasOwn(x,k))
 &&UUID.test(x.threadId)&&UUID.test(x.messageId)&&x.threadId!==x.messageId
 &&validMission(x.agentId,x.missionId)
 &&typeof x.instruction==='string'&&x.instruction.trim().length>=5&&x.instruction.length<=900
 &&!/[\x00-\x1f\x7f]/.test(x.instruction);}
export function createFounderConversationHandler({getStore=getFounderConversationStore,getInbox=getFounderInboxStore}={}){
 return async function handler(req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  if(!['GET','POST'].includes(req.method)){
   res.setHeader('Allow','GET, POST');
   return res.status(405).json(apiError('METHOD_NOT_ALLOWED','GET or POST required'));}
  const session=verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]);
  if(!session)return res.status(401).json(apiError('UNAUTHENTICATED','Sign in required'));
  if(session.email!==FOUNDER)return res.status(403).json(apiError('FOUNDER_ONLY','Founder only'));
  if(req.env?.VAOS_FOUNDER_CONVERSATION_CONTROL!=='ledger-only-v1'
   ||req.env?.VAOS_FOUNDER_INBOX_CONTROL!=='record-only-v1'
   ||req.env?.VAOS_FOUNDER_CHAT_CONTROL!=='qualified-readonly-v1')
   return res.status(409).json(apiError('FOUNDER_CONVERSATION_DISABLED','Conversation ledger not commissioned'));
  if(req.method==='GET'){
   let agentId,missionId;
   try{
    const u=new URL(req.url);if(u.searchParams.size!==2
      ||u.searchParams.getAll('agentId').length!==1||u.searchParams.getAll('missionId').length!==1)throw Error();
    agentId=u.searchParams.get('agentId');missionId=u.searchParams.get('missionId');
    if(!validMission(agentId,missionId))throw Error();
   }catch{return res.status(422).json(apiError('VALIDATION_ERROR','Agent and mission required'));}
   try{
    const data=await getStore(req.env).history({actorEmail:session.email,agentId,missionId});
    if(!Array.isArray(data?.turns)||data.agentId!==agentId||data.missionId!==missionId
      ||data.actionAuthorized!==false)throw Error();
    return res.status(200).json({data});
   }catch{return res.status(503).json(apiError('FOUNDER_CONVERSATION_UNAVAILABLE','History unavailable'));}
  }
  let origin;try{origin=new URL(req.url).origin;}catch{origin=null;}
  if(!origin||req.headers?.origin!==origin)
   return res.status(403).json(apiError('ORIGIN_DENIED','Same origin required'));
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers?.['content-type']||''))
   return res.status(415).json(apiError('CONTENT_TYPE_DENIED','JSON required'));
  if(!validBody(req.body))return res.status(422).json(apiError('VALIDATION_ERROR','Invalid conversation envelope'));
  const {threadId,messageId,agentId,missionId,instruction}=req.body;
  const recordedText='Mission '+missionId+'. '+instruction.trim();
  let inbox;
  try{
   inbox=await getInbox(req.env).append({messageId,agentId,kind:'REPORT_REQUEST',
    instruction:recordedText,actorEmail:session.email});
   if(inbox?.outcome==='RATE_LIMITED')return res.status(429).json(apiError('RATE_LIMITED','Inbox rate limit'));
   if(inbox?.outcome==='IDEMPOTENCY_CONFLICT')return res.status(409).json(apiError('IDEMPOTENCY_CONFLICT','Message ID conflict'));
   if(!['RECORDED','REPLAY'].includes(inbox?.outcome)||inbox.message?.status!=='RECORDED_NOT_ROUTED'
      ||inbox.message?.messageId!==messageId)throw Error();
  }catch{return res.status(503).json(apiError('FOUNDER_CONVERSATION_STORAGE_UNAVAILABLE','Inbox recording unverified'));}
  try{
   const linked=await getStore(req.env).link({threadId,messageId,agentId,missionId,actorEmail:session.email});
   if(linked?.outcome==='RATE_LIMITED')return res.status(429).json(apiError('RATE_LIMITED','Conversation limit'));
   if(['THREAD_CONFLICT','IDEMPOTENCY_CONFLICT','THREAD_LIMIT','PREVIOUS_REPLY_PENDING'].includes(linked?.outcome))
    return res.status(409).json(apiError(linked.outcome,'Conversation sequence must be reconciled'));
   if(!['LINKED','REPLAY'].includes(linked?.outcome)||linked.threadId!==threadId
      ||linked.messageId!==messageId||linked.actionAuthorized===true)throw Error();
   return res.status(linked.outcome==='LINKED'?201:200).json({data:{...linked,status:'RECORDED_NOT_ROUTED',actionAuthorized:false}});
  }catch{return res.status(503).json(apiError('FOUNDER_CONVERSATION_STORAGE_UNAVAILABLE','Ledger linkage unverified; retry only with same IDs'));}
 };
}
export default createFounderConversationHandler();
