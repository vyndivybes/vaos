import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {VAOS_WORKFORCE_AGENT_IDS} from '../runtime/vaos-eight-operating-model.mjs';
import {ROLE_EXERCISES,TRAINING_OBSERVED_AT as observedAt,teachingRecord} from './workforce-training-fixtures.mjs';
import {evaluateTrainingRecord} from './workforce-role-training.mjs';
import {createTrainingStore} from './workforce-training-store.mjs';
assert.deepEqual(Object.keys(ROLE_EXERCISES).sort(),[...VAOS_WORKFORCE_AGENT_IDS].sort());
for(const employeeId of VAOS_WORKFORCE_AGENT_IDS){
 test(employeeId+': good, seeded defect, missing input and production rejection',()=>{
  const options={environment:'LOCAL_ISOLATED_SYNTHETIC',observedAt};
  const good=teachingRecord(employeeId,'good');
  const bad=teachingRecord(employeeId,'bad');
  assert.deepEqual(evaluateTrainingRecord(employeeId,good,options).findings,[]);
  const result=evaluateTrainingRecord(employeeId,bad,options);
  assert.deepEqual(result.findings,ROLE_EXERCISES[employeeId].expected);
  assert.equal(result.qualificationGranted,false);assert.equal(result.productionWriteAuthorized,false);
  assert.throws(()=>evaluateTrainingRecord(employeeId,{id:good.id,synthetic:true},options),/SOURCE_INVALID/);
  assert.throws(()=>evaluateTrainingRecord(employeeId,{...good,synthetic:false},options),/SYNTHETIC_RECORD_REQUIRED/);
  assert.throws(()=>evaluateTrainingRecord(employeeId,good,{...options,environment:'production'}),/ISOLATED_TRAINING_REQUIRED/);
 });
 test(employeeId+': interruption, restart, duplicate, conflict, tamper and unauthorized actor',()=>{
  const dir=mkdtempSync(join(tmpdir(),'vaos-training-'));
  try{
   const args={employeeId,record:teachingRecord(employeeId,'bad'),eventId:'TRAINING-EVENT',actor:'training-supervisor',observedAt};
   const store=createTrainingStore(dir);
   assert.throws(()=>store.run({...args,actor:'unknown'}),/ACTOR_DENIED/);
   assert.throws(()=>store.run({...args,failBeforeCommit:true}),/INTERRUPTION/);
   const output=createTrainingStore(dir).run(args);
   assert.equal(output.replayed,false);
   assert.deepEqual(output.output.findings,ROLE_EXERCISES[employeeId].expected);
   assert.deepEqual(createTrainingStore(dir).run(args),{replayed:true,output:output.output});
   assert.throws(()=>createTrainingStore(dir).run({...args,record:teachingRecord(employeeId,'good')}),/EVENT_CONFLICT/);
   const path=join(dir,'TRAINING-EVENT.json');const corrupted=JSON.parse(readFileSync(path,'utf8'));
   corrupted.output.findings=[];writeFileSync(path,JSON.stringify(corrupted));
   assert.throws(()=>createTrainingStore(dir).run(args),/OUTPUT_CORRUPT/);
  }finally{rmSync(dir,{recursive:true,force:true});}
 });
}
test('unknown role, malformed time, unsafe event path and invalid numeric sources fail closed',()=>{
 const record=teachingRecord('finance','good');const opts={environment:'LOCAL_ISOLATED_SYNTHETIC',observedAt};
 assert.throws(()=>evaluateTrainingRecord('unknown',record,opts),/ROLE_UNKNOWN/);
 assert.throws(()=>evaluateTrainingRecord('finance',record,{...opts,observedAt:'invalid'}),/TIME_REQUIRED/);
 assert.throws(()=>evaluateTrainingRecord('finance',{...record,debitPaise:0.5},opts),/SOURCE_INVALID/);
 const dir=mkdtempSync(join(tmpdir(),'vaos-training-'));
 try{assert.throws(()=>createTrainingStore(dir).run({employeeId:'finance',record,eventId:'../production',actor:'training-supervisor',observedAt}),/EVENT_INVALID/);}finally{rmSync(dir,{recursive:true,force:true});}
});

test('whitespace references are missing evidence, never a clean training result',()=>{
 const options={environment:'LOCAL_ISOLATED_SYNTHETIC',observedAt};
 for(const [id,patch,expected] of [
  ['orchestrator',{owner:' ',prerequisite:'\t'},['OWNER_MISSING','PREREQUISITE_MISSING']],
  ['knowledge',{sourceRef:' '},['SOURCE_MISSING']],
  ['procurement',{unit:' '},['UNIT_MISSING']],
  ['inventory',{lot:' '},['LOT_TRACE_MISSING']],
  ['people',{attendanceRef:' '},['ATTENDANCE_SOURCE_MISSING']],
 ])assert.deepEqual(evaluateTrainingRecord(id,{...teachingRecord(id,'good'),...patch},options).findings,expected);
});
test('negative stock movements and unsafe monetary integers fail closed',()=>{
 const options={environment:'LOCAL_ISOLATED_SYNTHETIC',observedAt};
 for(const patch of [{receipts:-1},{issues:-1},{opening:Number.MAX_VALUE,receipts:Number.MAX_VALUE}])
  assert.throws(()=>evaluateTrainingRecord('inventory',{...teachingRecord('inventory','good'),...patch},options),/SOURCE_INVALID/);
 for(const patch of [{debitPaise:Number.MAX_SAFE_INTEGER+1},{creditPaise:Number.MAX_SAFE_INTEGER+1}])
  assert.throws(()=>evaluateTrainingRecord('finance',{...teachingRecord('finance','good'),...patch},options),/SOURCE_INVALID/);
});
