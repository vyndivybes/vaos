import {summarizeMissionSnapshot} from './mission-status-model.mjs';
export function prepareFounderMissionReport({record,agentId,messageId,missionId,snapshot}={}){
 if(!['project','orchestrator'].includes(agentId)||record?.messageId!==messageId
 ||record?.recipientAgentId!==agentId||record?.kind!=='REPORT_REQUEST'
 ||record?.status!=='RECORDED_NOT_ROUTED')throw Error('FOUNDER_REPORT_REQUEST_UNCONFIRMED');
 const s=summarizeMissionSnapshot(snapshot);
 if(s.id!==missionId)throw Error('FOUNDER_REPORT_MISSION_MISMATCH');
 return Object.freeze({
 status:'READ_ONLY_PREVIEW_NOT_AGENT_REPLY',source:'VAOS_PERSISTED_MISSION_SNAPSHOT',
 agentId,messageId,missionId,missionStatus:s.status,sourceUpdatedAt:s.updatedAt,
 verifiedWorkPackages:s.completed,totalWorkPackages:s.total,percentVerified:s.percent,
 blockedWorkPackageIds:s.jobs.filter(j=>['BLOCKED','FAILED'].includes(j.status)).map(j=>j.id),
 evidenceRefs:[...new Set(s.jobs.filter(j=>j.verified).flatMap(j=>j.evidenceRefs))],
 readyForHumanClosure:s.readyForClosure,warning:s.warning,modelInvoked:false,actionAuthorized:false
 });
}
