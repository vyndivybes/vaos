import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {apiError} from '../lib/api-contracts.mjs';
import {getFounderInboxStore} from '../lib/founder-inbox-provider.mjs';
import {VAOS_WORKFORCE_AGENT_IDS} from '../../../platform/runtime/vaos-eight-operating-model.mjs';
const AGENTS=new Set(VAOS_WORKFORCE_AGENT_IDS);
const FOUNDER='shyamsundhar1982@gmail.com';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KINDS=new Set(['INSTRUCTION','REPORT_REQUEST','OVERRIDE_PROPOSAL']);
function validMessage(body){
 return body&&typeof body==='object'&&!Array.isArray(body)
 &&Object.keys(body).length===4
 &&Object.keys(body).every(x=>['messageId','agentId','kind','instruction'].includes(x))
 &&typeof body.messageId==='string'&&UUID.test(body.messageId)
 &&AGENTS.has(body.agentId)&&KINDS.has(body.kind)
 &&typeof body.instruction==='string'&&body.instruction.length<=2000&&body.instruction.trim().length>=5
 &&!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(body.instruction);
}
export function createFounderInboxHandler({getStore=getFounderInboxStore}={}){
 return async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(!['GET','POST'].includes(req.method)){
   res.setHeader('Allow','GET, POST');
   return res.status(405).json(apiError('METHOD_NOT_ALLOWED','GET or POST required'));
  }
  const session=verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]);
  if(!session)return res.status(401).json(apiError('UNAUTHENTICATED','Sign in to VAOS'));
  if(session.email!==FOUNDER)return res.status(403).json(apiError('FOUNDER_ONLY','Founder identity required'));
  if(req.env?.VAOS_FOUNDER_INBOX_CONTROL!=='record-only-v1'){
   return res.status(409).json(apiError('FOUNDER_INBOX_DISABLED','Founder inbox not commissioned'));
  }
  if(req.method==='GET'){
   let agentId;
   try{
    const u=new URL(req.url,'https://vaos.invalid');
    if([...u.searchParams.keys()].some(k=>k!=='agentId')||u.searchParams.getAll('agentId').length!==1)throw Error();
    agentId=u.searchParams.get('agentId');if(!AGENTS.has(agentId))throw Error();
   }catch{return res.status(422).json(apiError('VALIDATION_ERROR','Valid agentId required'));}
   try{
    const data=await getStore(req.env).list({agentId,actorEmail:session.email});
    if(!data||!Array.isArray(data.messages))throw Error();
    return res.status(200).json({data});
   }catch{return res.status(503).json(apiError('FOUNDER_INBOX_UNAVAILABLE','Could not read conversation records'));}
  }
  let origin;
  try{origin=new URL(req.url).origin;}catch{origin=null;}
  if(!origin||req.headers?.origin!==origin){
   return res.status(403).json(apiError('ORIGIN_DENIED','Same-origin request required'));
  }
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers?.['content-type']||'')){
   return res.status(415).json(apiError('CONTENT_TYPE_DENIED','JSON request required'));
  }
  const body=req.body;
  if(!validMessage(body))return res.status(422).json(apiError('VALIDATION_ERROR','Invalid message envelope'));
  try{
   const data=await getStore(req.env).append({
    messageId:body.messageId,agentId:body.agentId,kind:body.kind,
    instruction:body.instruction.trim(),actorEmail:session.email
   });
   if(data?.outcome==='RATE_LIMITED')return res.status(429).json(apiError('RATE_LIMITED','Too many founder messages'));
   if(data?.outcome==='IDEMPOTENCY_CONFLICT')return res.status(409).json(apiError('IDEMPOTENCY_CONFLICT','Message ID already used for different contents'));
   if(!['RECORDED','REPLAY'].includes(data?.outcome)
      ||data?.message?.status!=='RECORDED_NOT_ROUTED')throw Error();
   return res.status(data.outcome==='RECORDED'?201:200).json({data});
  }catch{return res.status(503).json(apiError('FOUNDER_INBOX_UNAVAILABLE','Message was not confirmed; retry only with same message ID'));}
 };
}
export default createFounderInboxHandler();
