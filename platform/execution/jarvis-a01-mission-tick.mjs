/** JARVIS-A01 founder-authorized, bounded scheduled read-only mission review.
 * Limits the pre-existing governed mission consumer to the single A01 mission.
 * Neither mission completion nor signed read receipts certify underlying ERP source revisions.
 */
export const A01_MISSION_ID='JARVIS-A01-20261118';
export const A01_MISSION_CRON='7,22,37,52 * * * *';
const safe={missionId:A01_MISSION_ID,readOnly:true,actionAuthorized:false,
  productionWriteAuthorized:false,businessSourceAuthorityVerified:false,
  sourceCompletenessVerified:false,aiModelInvocations:0};

export async function runA01MissionTick({control,service,readDepartment,runSweep}={}){
  if(control!=='signed-readonly-v1')return {...safe,status:'DISABLED',processed:0,submitted:0,verified:0,returned:0,failures:0};
  if(!service||typeof service.listRunnableMissions!=='function'||
      typeof runSweep!=='function'||typeof readDepartment!=='function')
    throw Error('A01_TICK_SERVICE_REQUIRED');
  const scoped=Object.freeze({
    ...service,
    // Completion of bounded observations must never close a mission whose VYNDI source revision is unverified.
    prepareMissionClosure:undefined,
    async listRunnableMissions(){
      const found=await service.listRunnableMissions({limit:8});
      if(!Array.isArray(found?.missionIds)||found.missionIds.length>8||
        found.missionIds.some(id=>typeof id!=='string')||
        new Set(found.missionIds).size!==found.missionIds.length)
        throw Error('A01_MISSION_DISCOVERY_INVALID');
      if(!found.missionIds.includes(A01_MISSION_ID))return {missionIds:[]};
      if(typeof service.snapshot!=='function')throw Error('A01_MISSION_SNAPSHOT_REQUIRED');
      const snapshot=await service.snapshot(A01_MISSION_ID);
      if(snapshot?.mission?.id!==A01_MISSION_ID||!Array.isArray(snapshot?.handoffs)||
          snapshot.handoffs.length!==8)throw Error('A01_MISSION_SNAPSHOT_INVALID');
      if(snapshot.mission.status!=='ACTIVE')return {missionIds:[]};
      if(snapshot.handoffs.every(h=>h.status==='COMPLETED'))return {missionIds:[]};
      return {missionIds:[A01_MISSION_ID]};
    }
  });
  const out=await runSweep({service:scoped,maxMissions:1,maxHandoffs:1,readDepartment});
  if(!out||!Number.isSafeInteger(out.processed)||out.processed<0||out.processed>1||
      !Array.isArray(out.failures)||out.failures.some(x=>x.missionId!==A01_MISSION_ID)||
      ['submitted','verified','returned','preparedForClosure'].some(k=>
        !Number.isSafeInteger(out[k])||out[k]<0||out[k]>(k==='returned'?8:4)))
      throw Error('A01_MISSION_SWEEP_INVALID');
  return {...safe,
    status:out.failures.length?'HOLD':out.processed===1?'OBSERVED':'NO_A01_RUNNABLE_WORK',
    processed:out.processed,submitted:out.submitted,verified:out.verified,
    returned:out.returned,failures:out.failures.length,
    preparedForClosure:out.preparedForClosure};
}
