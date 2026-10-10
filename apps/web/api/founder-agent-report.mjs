import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {apiError} from '../lib/api-contracts.mjs';
import {getFounderInboxStore} from '../lib/founder-inbox-provider.mjs';
import {getEightAgentOperatingService} from '../lib/operating-provider.mjs';
import {prepareFounderMissionReport} from '../lib/founder-report-preview.mjs';
const FOUNDER='shyamsundhar1982@gmail.com';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MISSION=/^[a-zA-Z0-9][a-zA-Z0-9._:-]{3,95}$/;
function valid(b){return b&&typeof b==='object'&&!Array.isArray(b)
&&Object.keys(b).length===4
&&Object.keys(b).every(k=>['operation','agentId','messageId','missionId'].includes(k))
&&b.operation==='PREVIEW_MISSION_REPORT'&&['orchestrator','project'].includes(b.agentId)
&&typeof b.messageId==='string'&&UUID.test(b.messageId)
&&typeof b.missionId==='string'&&MISSION.test(b.missionId);}
export function createFounderAgentReportHandler({getInboxStore=getFounderInboxStore,
getMissionService=getEightAgentOperatingService}={}){
 return async function handler(req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json(apiError('METHOD_NOT_ALLOWED','POST required'));}
  const session=verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]);
  if(!session)return res.status(401).json(apiError('UNAUTHENTICATED','Sign in required'));
  if(session.email!==FOUNDER)return res.status(403).json(apiError('FOUNDER_ONLY','Founder identity required'));
  if(req.env?.VAOS_FOUNDER_INBOX_CONTROL!=='record-only-v1'||
    req.env?.VAOS_FOUNDER_AGENT_REPORT_CONTROL!=='preview-only-v1')
    return res.status(409).json(apiError('FOUNDER_REPORT_DISABLED','Report preview is not commissioned'));
  let origin;try{origin=new URL(req.url).origin;}catch{origin=null;}
  if(!origin||req.headers?.origin!==origin)return res.status(403).json(apiError('ORIGIN_DENIED','Same-origin request required'));
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers?.['content-type']||''))
    return res.status(415).json(apiError('CONTENT_TYPE_DENIED','JSON request required'));
  if(!valid(req.body))return res.status(422).json(apiError('VALIDATION_ERROR','Unsupported report request'));
  const {agentId,messageId,missionId}=req.body;
  let record;
  try{
   const records=await getInboxStore(req.env).list({actorEmail:session.email,agentId});
   if(!Array.isArray(records?.messages))throw Error();
   record=records.messages.find(m=>m?.messageId===messageId);
  }catch{return res.status(503).json(apiError('FOUNDER_REPORT_SOURCE_UNAVAILABLE','Recorded request unavailable'));}
  if(record?.kind!=='REPORT_REQUEST'||record?.status!=='RECORDED_NOT_ROUTED'
     ||record?.recipientAgentId!==agentId)
   return res.status(409).json(apiError('FOUNDER_REPORT_UNCONFIRMED','Persisted report request required'));
  try{
   const snapshot=await getMissionService(req.env).snapshot(missionId);
   const data=prepareFounderMissionReport({record,agentId,messageId,missionId,snapshot});
   return res.status(200).json({data});
  }catch{return res.status(503).json(apiError('FOUNDER_REPORT_UNAVAILABLE','Mission evidence unavailable'));}
 };
}
export default createFounderAgentReportHandler();
