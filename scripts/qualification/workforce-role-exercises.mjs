import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createTrainingStore} from '../../platform/qualification/workforce-training-store.mjs';
import {ROLE_EXERCISES,TRAINING_OBSERVED_AT,teachingRecord} from '../../platform/qualification/workforce-training-fixtures.mjs';
import {evidenceHash} from '../../platform/qualification/workforce-role-training.mjs';
const dir=mkdtempSync(join(tmpdir(),'vaos-role-exercises-'));
const employees=[];
try{
 for(const employeeId of Object.keys(ROLE_EXERCISES)){
  const results=[];
  for(const variant of ['good','bad']){
   const record=teachingRecord(employeeId,variant);
   const args={employeeId,record,eventId:record.id,actor:'training-supervisor',observedAt:TRAINING_OBSERVED_AT};
   const {output}=createTrainingStore(dir).run(args);
   assert.deepEqual(output.findings,variant==='good'?[]:ROLE_EXERCISES[employeeId].expected);
   assert.deepEqual(createTrainingStore(dir).run(args).output,output);
   results.push({variant,expected:variant==='good'?[]:ROLE_EXERCISES[employeeId].expected,
    observed:output.findings,sourceRef:record.id,sourceHash:output.sourceHash,outputHash:evidenceHash(output),
    goldenAnswerCheck:'PASS',localRestartReadback:'PASS'});
  }
  employees.push({employeeId,localDeterministicExercises:'PASS',results,
   independentReview:'NOT_OBSERVED',hostedIntegration:'NOT_EXERCISED',
   productionExecutorQualified:false,trainingQualificationGranted:false});
 }
 const paths=['platform/qualification/workforce-role-training.mjs','platform/qualification/workforce-training-store.mjs',
  'platform/qualification/workforce-training-fixtures.mjs','platform/qualification/workforce-role-training.test.mjs',
  'scripts/qualification/workforce-role-exercises.mjs'];
 const report={schemaVersion:'VAOS_ISOLATED_ROLE_EXERCISES_V1',observedAt:new Date().toISOString(),
  sourceBaselineCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  sourceHashes:Object.fromEntries(paths.map(p=>[p,evidenceHash(readFileSync(p,'utf8'))])),
  environment:'LOCAL_ISOLATED_SYNTHETIC',synthetic:true,networkUsed:false,
  persistence:'Single-writer local files; not PostgreSQL recovery or authenticated hosted acceptance',
  employeeCount:employees.length,exerciseCount:employees.length*2,employees,
  qualificationGranted:false,productionWrites:false};
 report.evidenceHash=evidenceHash(report);
 if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({employees:report.employeeCount,exercises:report.exerciseCount,
  result:'LOCAL_DETERMINISTIC_EXERCISES_PASS',qualificationGranted:false}));
}finally{rmSync(dir,{recursive:true,force:true});}
