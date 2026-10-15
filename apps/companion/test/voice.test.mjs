import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createCompanion} from '../server.mjs';
const enabled=process.env.VAOS_VOICE_ACCEPTANCE==='1';
test('real local Whisper transcribes an original synthetic voice fixture and removes the uploaded audio',{skip:!enabled,timeout:180000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'vaos-voice-'));
 const app=await createCompanion({dataDir:dir,python:process.env.VAOS_COMPANION_PYTHON,modelDir:process.env.VAOS_COMPANION_MODEL});
 try{
  assert.equal(app.capabilities.voice,true);
  const data=(await readFile(process.env.VAOS_VOICE_FIXTURE)).toString('base64');
  const job=app.jobs.submit('voice.transcribe',{format:'wav',data});await app.jobs.idle();
  const result=app.jobs.get(job.id);assert.equal(result.state,'succeeded',JSON.stringify(result));
  assert.match(result.result.text,/local voice recognition test/i);
  assert.match(result.result.text,/project report/i);
  assert.deepEqual(await readdir(join(dir,'uploads')),[]);
  assert.doesNotMatch(JSON.stringify(app.store.jobs()),/local voice recognition test/);
 }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
