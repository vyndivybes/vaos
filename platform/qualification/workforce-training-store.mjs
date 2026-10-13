/** Local file-backed training replay; not a database recovery implementation. */
import {mkdirSync,readFileSync,writeFileSync,renameSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {evaluateTrainingRecord,evidenceHash} from './workforce-role-training.mjs';
export function createTrainingStore(directory){
 mkdirSync(directory,{recursive:true});
 const marker=join(directory,'ISOLATED-SYNTHETIC-TRAINING');
 if(!existsSync(marker))writeFileSync(marker,'Local training only. No production backend.\n',{flag:'wx'});
 return {run({employeeId,record,eventId,actor,observedAt,failBeforeCommit=false}){
  if(actor!=='training-supervisor')throw Error('TRAINING_ACTOR_DENIED');
  if(typeof eventId!=='string'||!/^TRAINING-[A-Z0-9-]+$/.test(eventId))throw Error('TRAINING_EVENT_INVALID');
  const output=evaluateTrainingRecord(employeeId,record,{environment:'LOCAL_ISOLATED_SYNTHETIC',observedAt});
  const inputHash=evidenceHash({employeeId,record,observedAt});
  const path=join(directory,eventId+'.json');
  if(existsSync(path)){
   const prior=JSON.parse(readFileSync(path,'utf8'));
   if(prior.inputHash!==inputHash)throw Error('TRAINING_EVENT_CONFLICT');
   if(evidenceHash(prior.output)!==prior.outputHash)throw Error('TRAINING_OUTPUT_CORRUPT');
   return {replayed:true,output:prior.output};
  }
  const envelope={eventId,inputHash,output,outputHash:evidenceHash(output)};
  const pending=path+'.pending';
  writeFileSync(pending,JSON.stringify(envelope)+'\n');
  if(failBeforeCommit)throw Error('TRAINING_INJECTED_INTERRUPTION');
  renameSync(pending,path);
  return {replayed:false,output};
 }};
}
