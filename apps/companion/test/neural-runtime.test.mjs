import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir,mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createCompanion} from '../server.mjs';
const enabled=process.env.VAOS_NEURAL_ACCEPTANCE==='1';

test('real CPU Kokoro service returns PCM WAV, cleans uploads, cancels work and needs no AI service key',{skip:!enabled,timeout:180000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'vaos-neural-runtime-'));
 const app=await createCompanion({dataDir:dir,token:'neural-fixture',python:process.env.VAOS_COMPANION_PYTHON,neuralModelDir:resolve(process.env.VAOS_COMPANION_NEURAL_MODEL)});
 const {origin}=await app.listen(0);
 const request=(text,signal)=>fetch(origin+'/api/voice/synthesize',{method:'POST',headers:{Authorization:'Bearer neural-fixture','Content-Type':'application/json'},body:JSON.stringify({text,language:'en-US'}),signal});
 try{
  assert.equal(app.capabilities.neuralVoice,true);
  const start=performance.now(),response=await request('Good evening. I am VAOS. Your project history is available with source references. Every change remains under your control.');
  assert.equal(response.status,200,await (response.ok?Promise.resolve(''):response.text()));assert.equal(response.headers.get('Content-Type'),'audio/wav');
  assert.equal(response.headers.get('X-VAOS-Voice-Provider'),'kokoro-onnx');assert.equal(response.headers.get('X-VAOS-Voice-Profile'),'vaos-cinematic-v1');
  const wav=Buffer.from(await response.arrayBuffer());assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.toString('ascii',8,12),'WAVE');assert.equal(wav.readUInt32LE(24),24000);assert.ok(wav.length>48000);
  const seconds=(wav.length-44)/48000;console.log(JSON.stringify({profile:'vaos-cinematic-v1',seconds,synthesisMs:Math.round(performance.now()-start),bytes:wav.length}));
  assert.deepEqual(await readdir(join(dir,'uploads')),[]);
  if(process.env.VAOS_NEURAL_ACCEPTANCE_DIR){await mkdir(process.env.VAOS_NEURAL_ACCEPTANCE_DIR,{recursive:true});await writeFile(join(process.env.VAOS_NEURAL_ACCEPTANCE_DIR,'vaos-cinematic-v1.wav'),wav);}
  const controller=new AbortController(),cancelled=request('This synthesis will be cancelled before delivery.',controller.signal);setTimeout(()=>controller.abort(),100);await assert.rejects(cancelled,/abort/i);
  // A follow-up proves cancellation released the synthesis lock and no stale audio is served.
  let followup;for(let i=0;i<20;i++){await new Promise(r=>setTimeout(r,100));followup=await request('Ready.');if(followup.status!==400)break;const error=await followup.clone().json();if(error.error!=='NEURAL_BUSY')break;}
  assert.equal(followup.status,200,await (followup.ok?Promise.resolve(''):followup.text()));await followup.arrayBuffer();assert.deepEqual(await readdir(join(dir,'uploads')),[]);
 }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
