import { parseCookies, SESSION_COOKIE, verifySessionToken } from '../lib/auth.mjs';
import { apiError } from '../lib/api-contracts.mjs';
import { createSupabaseControlStore } from '../../../platform/persistence/supabase-store.mjs';
import { resolveDurableControlConfig } from '../lib/durable-control-provider.mjs';
import { createVyndiReadBridgeClient } from '../../../platform/execution/vyndi-read-bridge-client.mjs';
import { createGovernedScheduleReader } from '../../../platform/integrations/vyndi-governed-schedule-reader.mjs';

const PROJECT_ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;

/** No deployment key or client-supplied manifest may grant schedule access. */
function authorized(email,allowlist){
  if(typeof allowlist!=='string'||!allowlist.trim())return false;
  return allowlist.split(',').some(entry=>entry.trim().toLowerCase()===email?.toLowerCase());
}

export function getProjectScheduleReader(env){
  const store=createSupabaseControlStore(resolveDurableControlConfig(env));
  const sourceClient=createVyndiReadBridgeClient({
    signer:store,
    serviceBinding:env?.VYNDI,
  });
  return createGovernedScheduleReader({
    sourceClient,
    approvedRegistry:{getApproved:(projectId)=>store.getApprovedProgramBaseline(projectId)},
  });
}

export function createProjectScheduleHandler({getReader=getProjectScheduleReader}={}){
  return async function handler(req,res){
    res.setHeader('Cache-Control','no-store');
    if(req.method!=='GET'){
      res.setHeader('Allow','GET');
      return res.status(405).json(apiError('METHOD_NOT_ALLOWED','Read-only GET required'));
    }
    const session=verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]);
    if(!session)return res.status(401).json(apiError('UNAUTHENTICATED','Authentication required'));
    if(!authorized(session.email,req.env?.VAOS_SCHEDULE_READERS)){
      return res.status(403).json(apiError('SCHEDULE_SCOPE_FORBIDDEN','Schedule-read role not assigned'));
    }
    let projectId;
    try{projectId=new URL(req.url,'https://vaos.invalid').searchParams.get('projectId');}
    catch{projectId=null;}
    if(typeof projectId!=='string'||!PROJECT_ID.test(projectId)){
      return res.status(422).json(apiError('VALIDATION_ERROR','Valid projectId required'));
    }
    try{
      const result=await getReader(req.env).assess(projectId);
      // Nothing in this endpoint grants approval or dispatches an escalation.
      return res.status(200).json({data:result});
    }catch{
      return res.status(503).json(apiError('PROJECT_SCHEDULE_UNAVAILABLE','Schedule read could not be completed'));
    }
  };
}
export default createProjectScheduleHandler();
