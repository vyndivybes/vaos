import test from 'node:test';
import assert from 'node:assert/strict';
import {executeQualificationRecovery} from './qualification-recovery.mjs';

const original={id:'candidate-1',actionType:'WORKFORCE.QUALIFY',status:'FAILED'};
const claimed={id:'claimed-1',actionType:'WORKFORCE.QUALIFY',leaseToken:'test-lease'};

test('unregistered failed-job action is not claimed or executed',async()=>{
 const calls=[];
 const result=await executeQualificationRecovery({
  store:{async claimQualificationRecovery(){calls.push('CLAIM');throw Error('DO_NOT_CLAIM');}},
  registry:{get(){return undefined;}},
  workerId:'qualification-worker',failedJob:original
 });
 assert.equal(result,null);
 assert.deepEqual(calls,[]);
});
test('a claimed job whose action unexpectedly has no adapter is failed terminally, not left leased',async()=>{
 const failures=[];
 const result=await executeQualificationRecovery({
  store:{
   async claimQualificationRecovery(){return {...claimed,actionType:'UNREGISTERED.ACTION'};},
   async failExecution(job,error){failures.push({job,error});return {outcome:'DEAD_LETTER'};}
  },
  registry:{get(action){return action===original.actionType?{execute:async()=>{throw Error('SHOULD_NOT_EXECUTE');}}:null;}},
  workerId:'qualification-worker',failedJob:original
 });
 assert.deepEqual(result,{status:'DEAD_LETTER',jobId:claimed.id});
 assert.equal(failures.length,1);
 assert.equal(failures[0].job.id,claimed.id);
 assert.equal(failures[0].error.code,'QUALIFICATION_RECOVERY_ADAPTER_MISSING');
 assert.equal(failures[0].error.retryable,false);
});
test('valid adapter completes only when verification is independently true',async()=>{
 const completed=[];
 const result=await executeQualificationRecovery({
  store:{
   async claimQualificationRecovery(){return claimed;},
   async completeExecution(job,data){completed.push({job,data});return {outcome:'SUCCEEDED'};}
  },
  registry:{get(){return {execute:async()=>({adapterId:'qualification-test',verification:{verified:true}})};}},
  workerId:'qualification-worker',failedJob:original
 });
 assert.equal(result.status,'SUCCEEDED');
 assert.equal(result.recovered,true);
 assert.equal(completed.length,1);
});
test('invalid verification fails terminally without falsely reporting recovery',async()=>{
 const failures=[];
 const result=await executeQualificationRecovery({
  store:{
   async claimQualificationRecovery(){return claimed;},
   async failExecution(job,error){failures.push(error);return {outcome:'DEAD_LETTER'};}
  },
  registry:{get(){return {execute:async()=>({verification:{verified:false}})};}},
  workerId:'qualification-worker',failedJob:original
 });
 assert.equal(result.status,'DEAD_LETTER');
 assert.equal(failures[0].code,'EXECUTION_VERIFICATION_FAILED');
 assert.equal(failures[0].retryable,false);
});
