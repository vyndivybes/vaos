/**
 * One hourly, bounded production observation independent of the physical
 * manufacturing mission lifecycle. All business writes are excluded.
 *
 * Authorization is checked twice: against persisted roster/contract here,
 * then by VAOS durable policy when the idempotent intent is proposed.
 */
export const PRODUCTION_OBSERVATION_ACTION = 'PRODUCTION.OBSERVE_WIP';
const ID_PATTERN = /^VAOS-[A-Z0-9-]{8,90}$/;
const HOLD = (reason) => ({status:'HOLD',actionType:PRODUCTION_OBSERVATION_ACTION,reason});

export async function runProductionReadOnlyObservation({
  controlService, executionEngine, mode, now = () => new Date(),
  missionId = 'VAOS-CARBON-FRAME-S-20261010',
} = {}) {
  if(typeof mode!=='function'||mode()!=='read-only-v1') return HOLD('PRODUCTION_MONITOR_DISABLED');
  if(!controlService || typeof controlService.snapshot!=='function'
    || typeof controlService.proposeIntent!=='function'
    || typeof executionEngine?.processProductionObservation!=='function') return HOLD('PRODUCTION_MONITOR_PORT_MISSING');
  if(!ID_PATTERN.test(missionId)) return HOLD('PRODUCTION_MONITOR_MISSION_ID_INVALID');
  try {
    const snapshot=await controlService.snapshot();
    const employees=snapshot?.workforce?.digitalEmployees;
    const contracts=snapshot?.workforce?.responsibilityContracts
      || snapshot?.responsibilityContracts;
    if(!Array.isArray(employees)||!Array.isArray(contracts)) return HOLD('PRODUCTION_MONITOR_SNAPSHOT_INVALID');
    const owner=employees.find(x=>x.id==='production');
    const verifier=employees.find(x=>x.id==='qa');
    const contract=contracts.find(x=>x.id===owner?.responsibilityContractId);
    if(owner?.status!=='ACTIVE'||owner?.qualificationLevel<3
      ||owner?.capabilities?.[PRODUCTION_OBSERVATION_ACTION]!==5
      ||verifier?.status!=='ACTIVE'||verifier?.qualificationLevel<3
      ||!contract||!Array.isArray(contract.autonomousActions)
      ||!contract.autonomousActions.includes(PRODUCTION_OBSERVATION_ACTION)
      ||contract.prohibitedActions?.includes(PRODUCTION_OBSERVATION_ACTION)
      ||contract.approvalRequiredActions?.includes(PRODUCTION_OBSERVATION_ACTION)) {
      return HOLD('PRODUCTION_MONITOR_AUTHORITY_OR_QUALIFICATION_DENIED');
    }
    const stamp=now();
    if(!(stamp instanceof Date)||!Number.isFinite(stamp.valueOf())) return HOLD('PRODUCTION_MONITOR_CLOCK_INVALID');
    const hourlyStamp=new Date(stamp);
    hourlyStamp.setUTCMinutes(0,0,0);
    const idempotencyKey=`vaos-production-l5:${hourlyStamp.toISOString()}`;
    if(mode()!=='read-only-v1') return HOLD('PRODUCTION_MONITOR_STOPPED');
    const proposed=await controlService.proposeIntent({
      idempotencyKey,agentId:'production',actionType:PRODUCTION_OBSERVATION_ACTION,
      risk:'low',reason:'Qualified unattended production WIP read-only observation',
      payload:{missionId,limit:50,monitoringScope:'PRODUCTION_L5_READ_ONLY_V1'},
      actor:'vaos-scheduled-production-observer',
    });
    if(proposed?.status==='EXECUTED') {
      return {status:'ALREADY_OBSERVED',actionType:PRODUCTION_OBSERVATION_ACTION,hour:hourlyStamp.toISOString()};
    }
    if(proposed?.status!=='AUTHORIZED') return HOLD('PRODUCTION_MONITOR_POLICY_NOT_AUTHORIZED');
    if(mode()!=='read-only-v1') return HOLD('PRODUCTION_MONITOR_STOPPED');
    const result=await executionEngine.processProductionObservation({idempotencyKey});
    if(!['SUCCEEDED','REPLAY'].includes(result?.status)) return HOLD('PRODUCTION_MONITOR_EXECUTION_NOT_VERIFIED');
    return {status:'PASS',actionType:PRODUCTION_OBSERVATION_ACTION,
      hour:hourlyStamp.toISOString(),executionJobId:result.jobId||null,
      evidence:'VAOS_DURABLE_EXECUTION_VERIFICATION',businessWrites:false};
  } catch {
    // Intent/queue outcome can be unknown after a transport failure;
    // the same hourly key is safe to reconcile but never blind-write.
    return HOLD('PRODUCTION_MONITOR_UNCERTAIN_INSPECT_EVIDENCE');
  }
}
