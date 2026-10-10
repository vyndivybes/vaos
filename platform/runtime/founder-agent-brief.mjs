import {
 VAOS_WORKFORCE_AGENT_IDS, VAOS_WORKFORCE_QUALIFICATION_FLOOR,
} from './vaos-eight-operating-model.mjs';

const permitted=new Set(VAOS_WORKFORCE_AGENT_IDS);
const value=(object,snake,camel)=>object?.[snake]??object?.[camel];
const status=(x)=>typeof x==='string'&&x.length<64?x:'UNKNOWN';

export function buildFounderAgentBrief({agentId,control,mission=null,observedAt=new Date().toISOString()}={}){
 if(!permitted.has(agentId))throw Error('AGENT_BRIEF_AGENT_INVALID');
 const workforce=control?.workforce?.digitalEmployees;
 if(!Array.isArray(workforce)||!Array.isArray(control?.agents))throw Error('AGENT_BRIEF_CONTROL_INVALID');
 if(mission!==null&&(!mission?.mission?.id||!Array.isArray(mission?.workPackages)||!Array.isArray(mission?.handoffs))){
  throw Error('AGENT_BRIEF_MISSION_INVALID');
 }
 const member=workforce.find(e=>e.id===agentId);
 const qualification=Number.isInteger(member?.qualificationLevel)?member.qualificationLevel:0;
 const qualified=member?.status==='ACTIVE'&&qualification>=VAOS_WORKFORCE_QUALIFICATION_FLOOR[agentId];
 const all=mission?.workPackages||[];
 const owned=all.filter(w=>value(w,'owner_agent_id','ownerAgentId')===agentId);
 const handoffs=mission?.handoffs||[];
 const reviewed=owned.filter(w=>handoffs.some(h=>{
   const maker=value(h,'to_agent_id','toAgentId');
   const verifier=value(h,'verified_by_agent_id','verifiedByAgentId');
   const refs=value(h,'evidence_refs','evidenceRefs');
   const reviewers=value(w,'verifier_agent_ids','verifierAgentIds');
   if(maker!==agentId||status(h.status)!=='COMPLETED'||typeof verifier!=='string'||verifier===maker
      ||!Array.isArray(refs)||!Array.isArray(reviewers)||!reviewers.includes(verifier))return false;
   return refs.some(x=>typeof x==='string'&&!x.startsWith('REVIEWED:')&&refs.includes('REVIEWED:'+x))
      &&value(h,'work_package_id','workPackageId')===w.id;
 })).length;
 const blocked=owned.filter(w=>['BLOCKED','FAILED'].includes(status(w.status))).length;
 const completed=owned.filter(w=>status(w.status)==='COMPLETED').length;
 const missionStatus=mission?status(mission.mission.status):null;
 const observation=qualified?'ROLE_QUALIFIED_FOR_REPORTING':'ROLE_QUALIFICATION_HOLD';
 let summary=qualified
 ?'Agent roster meets the configured qualification floor. Runtime liveness remains unverified.'
 :'Selected digital employee is not confirmed ACTIVE and qualified for this role.';
 if(mission)summary+=' Mission '+mission.mission.id+': '+completed+'/'+owned.length+
  ' owned work packages complete; '+reviewed+' have persisted independent-review references; '+blocked+' blocked or failed.';
 return Object.freeze({
  schemaVersion:'vaos.founder-agent-brief.v1',agentId,observedAt,
  source:'VAOS_PERSISTED_CONTROL_AND_MISSION_SNAPSHOT',generation:'DETERMINISTIC_NO_MODEL',
  status:observation,qualificationLevel:qualification,requiredQualificationLevel:VAOS_WORKFORCE_QUALIFICATION_FLOOR[agentId],
  runtimeLiveness:'UNVERIFIED',executionAuthorized:false,agentReply:false,
  missionId:mission?.mission.id||null,missionStatus,
  workPackages:{assigned:owned.length,completed,withIndependentReviewReference:reviewed,blockedOrFailed:blocked},
  verificationCaveat:'Review-reference presence is not an independent re-execution or evidence-content audit.',
  summary,
 });
}
