/** Offline software drills only. No network, credentials or production stores. */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {VAOS_JOB_CATALOG, VAOS_JOB_CATALOG_VERSION, VAOS_WORKFORCE_AGENT_IDS,
  createGovernedHandoff, transitionGovernedHandoff, routeJob,
  HANDOFF_OUTCOME as H} from '../../platform/runtime/vaos-eight-operating-model.mjs';
import {getDepartmentAuditScope, assessDepartmentAuditEvidence} from '../../platform/qualification/department-audit.mjs';

const employees=[];
for(const id of VAOS_WORKFORCE_AGENT_IDS){
  const jobs=[];
  for(const job of VAOS_JOB_CATALOG[id]){
    assert.equal(routeJob(job.actionType).ownerAgentId,id);
    const sender=id==='orchestrator'?'project':'orchestrator';
    const verifier=job.verifierAgentIds.find(v=>v!==id) || sender;
    const handoff=createGovernedHandoff({id:'TRAINING-'+job.actionType,
      missionId:'ISOLATED-SYNTHETIC-TRAINING',workPackageId:'TRAINING-'+job.actionType,
      fromAgentId:sender,toAgentId:id,requestedJob:job.actionType,
      reason:'Synthetic software state-machine drill',requiredOutcome:'Traceable synthetic handoff',
      acceptanceCriteria:['submission evidence required','self verification denied']});
    const accepted=transitionGovernedHandoff(handoff,{outcome:H.ACCEPT,byAgentId:id});
    assert.throws(()=>transitionGovernedHandoff(accepted,{outcome:H.SUBMIT,byAgentId:id}),/EVIDENCE_REQUIRED/);
    const submitted=transitionGovernedHandoff(accepted,{outcome:H.SUBMIT,byAgentId:id,evidenceRefs:['SYNTHETIC:output']});
    assert.throws(()=>transitionGovernedHandoff(submitted,{outcome:H.VERIFY,byAgentId:id,evidenceRefs:['SYNTHETIC:self']}),/VERIFIER_NOT_AUTHORIZED/);
    assert.throws(()=>transitionGovernedHandoff(submitted,{outcome:H.VERIFY,byAgentId:verifier}),/EVIDENCE_REQUIRED/);
    const completed=transitionGovernedHandoff(submitted,{outcome:H.VERIFY,byAgentId:verifier,evidenceRefs:['SYNTHETIC:checker']});
    assert.equal(completed.status,'COMPLETED');
    assert.equal(submitted.status,'SUBMITTED');
    assert.throws(()=>transitionGovernedHandoff(completed,{outcome:H.VERIFY,byAgentId:verifier,evidenceRefs:['SYNTHETIC:duplicate']}),/TRANSITION_INVALID/);
    jobs.push({actionType:job.actionType,softwareDrill:'PASS',checks:7,
      fixtureVerifier:verifier,independentEmployeeReviewObserved:false,
      roleExecution:'NOT_EXERCISED',triggerAcceptance:'NOT_EXERCISED'});
  }
  const scope=getDepartmentAuditScope(id);
  for(const page of scope.pages){
    const check=assessDepartmentAuditEvidence({employeeId:id,route:page.route,physicalReleaseHold:true});
    assert.equal(check.status,'HOLD');assert.equal(check.productionWriteAuthorized,false);
    assert.equal(check.releaseHoldPreserved,true);
  }
  assert.equal(assessDepartmentAuditEvidence({employeeId:id,route:'/outside-assigned-scope'}).status,'DENY');
  employees.push({employeeId:id,catalogJobs:jobs.length,assignedAuditRoutes:scope.pages.length,
    softwareControlDrills:'PASS',trainingQualification:'PENDING_ROLE_EXERCISES_AND_INDEPENDENT_REVIEW',
    productionDataRequiredForIsolatedTraining:false,qualificationGranted:false,jobs,
    remaining:['Representative role task with checked expected outcome','Authenticated isolated trigger-to-output execution',
      'Persisted output readback and recovery','Independent role review','Device and permission acceptance']});
}
const report={schemaVersion:'VAOS_PRELAUNCH_SOFTWARE_DRILLS_V1',observedAt:new Date().toISOString(),
  sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  catalogVersion:VAOS_JOB_CATALOG_VERSION,environment:'LOCAL_ISOLATED_SYNTHETIC',
  networkUsed:false,productionWrites:false,qualificationGranted:false,
  scope:'Routing and handoff state-machine controls; not employee competence or deployed acceptance',
  employeeCount:employees.length,jobCount:employees.reduce((n,e)=>n+e.catalogJobs,0),employees};
assert.equal(employees.length,16);
report.evidenceHash=createHash('sha256').update(JSON.stringify(report)).digest('hex');
const output=process.argv[2];
if(output)writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({employees:report.employeeCount,jobs:report.jobCount,
  softwareChecks:report.jobCount*7,status:'SOFTWARE_CONTROL_DRILLS_PASS',qualificationGranted:false,output:output||null}));
