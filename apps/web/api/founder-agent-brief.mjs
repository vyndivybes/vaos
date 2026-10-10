import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {apiError} from '../lib/api-contracts.mjs';
import {getDurableControlService} from '../lib/durable-control-provider.mjs';
import {getEightAgentOperatingService} from '../lib/operating-provider.mjs';
import {VAOS_WORKFORCE_AGENT_IDS} from '../../../platform/runtime/vaos-eight-operating-model.mjs';
import {buildFounderAgentBrief} from '../../../platform/runtime/founder-agent-brief.mjs';

const agents=new Set(VAOS_WORKFORCE_AGENT_IDS);
const missionPattern=/^[a-zA-Z0-9][a-zA-Z0-9._:-]{3,95}$/;
const founder='shyamsundhar1982@gmail.com';
export function createFounderAgentBriefHandler({
 getControlService=getDurableControlService,
 getMissionService=getEightAgentOperatingService,
 now=()=>new Date().toISOString(),
}={}){
 return async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json(apiError('METHOD_NOT_ALLOWED','GET required'));}
  const session=verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]);
  if(!session)return res.status(401).json(apiError('UNAUTHENTICATED','Sign in required'));
  if(session.email!==founder)return res.status(403).json(apiError('FOUNDER_ONLY','Founder role required'));
  if(req.env?.VAOS_FOUNDER_BRIEF_CONTROL!=='read-only-v1'){
   return res.status(409).json(apiError('AGENT_BRIEF_DISABLED','Briefing is not commissioned'));
  }
  let agentId,missionId;
  try{
   const url=new URL(req.url);
   if([...url.searchParams.keys()].some(k=>!['agentId','missionId'].includes(k)))throw Error();
   if(url.searchParams.getAll('agentId').length!==1||url.searchParams.getAll('missionId').length>1)throw Error();
   agentId=url.searchParams.get('agentId');missionId=url.searchParams.get('missionId');
   if(!agents.has(agentId)||(missionId!==null&&!missionPattern.test(missionId)))throw Error();
  }catch{return res.status(422).json(apiError('VALIDATION_ERROR','Valid agent and optional mission ID required'));}
  try{
   const control=await getControlService(req.env).snapshot();
   const mission=missionId?await getMissionService(req.env).snapshot(missionId):null;
   const data=buildFounderAgentBrief({agentId,control,mission,observedAt:now()});
   if(missionId&&data.missionId!==missionId)throw Error('MISMATCHED_MISSION');
   return res.status(200).json({data});
  }catch{return res.status(503).json(apiError('AGENT_BRIEF_UNAVAILABLE','Evidence-backed brief could not be produced'));}
 };
}
export default createFounderAgentBriefHandler();
