import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readdir,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createNeuralVoice,cleanupNeuralAudio} from '../neural-voice.mjs';
import {createNeuralSynthesis,NeuralUtterance} from '../../web/lib/local-neural-speech.mjs';
import {historicalQuery,formatHistoricalAnswer} from '../../web/lib/conversation-memory-ui.mjs';

test('historical questions select bounded local keyword recall and label excerpts without asserting current facts',()=>{
 assert.equal(historicalQuery('JARVIS, what did we decide about rotor steel?'),'rotor steel');
 assert.equal(historicalQuery('Recall rotor steel'),'rotor steel');
 assert.equal(historicalQuery('Approve all policies'),null);
 assert.equal(historicalQuery('How many current orders exist?'),null);
 assert.throws(()=>formatHistoricalAnswer({results:[]}),/RESPONSE_INVALID/);
 assert.match(formatHistoricalAnswer({authority:'UNTRUSTED_HISTORICAL_REFERENCE',actionAuthorized:false,policyMutable:false,results:[]}),/does not establish/);
});

test('neural service rejects language/text, bounds concurrency and removes audio after delivery and cancellation',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'vaos-neural-'));await mkdir(join(dir,'uploads'));let release;
 const voice=createNeuralVoice({dataDir:dir,modelDir:'fixed',operation:async(kind,input,{signal})=>{
  await new Promise((resolve,reject)=>{release=resolve;signal.addEventListener('abort',()=>reject(Error('CANCELLED')),{once:true});});
  const wav=Buffer.alloc(48);wav.write('RIFF',0);wav.write('WAVE',8);await writeFile(input.output,wav);
 }});
 try{
  const stale='neural-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.wav';await writeFile(join(dir,'uploads',stale),'abandoned audio');await writeFile(join(dir,'uploads','unrelated.txt'),'keep');await cleanupNeuralAudio(dir);assert.deepEqual(await readdir(join(dir,'uploads')),['unrelated.txt']);await rm(join(dir,'uploads','unrelated.txt'));
  await assert.rejects(voice.synthesize({text:'x'.repeat(601)}),/TEXT_INVALID/);
  await assert.rejects(voice.synthesize({text:'Hello',language:'ta-IN'}),/LANGUAGE_UNAVAILABLE/);
  const audio=voice.synthesize({text:'Hello'});await assert.rejects(voice.synthesize({text:'Second'}),/BUSY/);release();assert.equal((await audio).length,48);
  assert.deepEqual(await readdir(join(dir,'uploads')),[]);
  const cancelled=voice.synthesize({text:'Hello'});voice.cancel();await assert.rejects(cancelled,/CANCELLED/);assert.deepEqual(await readdir(join(dir,'uploads')),[]);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('neural browser playback reports actual playing, blocks stale synthesis and revokes audio URLs',async()=>{
 let respond,audio,revoked=[],started=0,ended=0;
 const transport={request:()=>new Promise(resolve=>{respond=resolve;})};
 const player=createNeuralSynthesis({transport,makeAudio:()=>audio={play:async()=>{},pause(){}},urls:{createObjectURL:()=> 'blob:test',revokeObjectURL:url=>revoked.push(url)}});
 const utterance=new NeuralUtterance('Hello');utterance.onstart=()=>started++;utterance.onend=()=>ended++;
 player.speak(utterance);player.cancel();respond(new Blob([Buffer.alloc(48)],{type:'audio/wav'}));await new Promise(r=>setImmediate(r));assert.equal(audio,undefined);assert.equal(started,0);
 player.speak(utterance);respond(new Blob([Buffer.alloc(48)],{type:'audio/wav'}));await new Promise(r=>setImmediate(r));assert.equal(started,0);audio.onplaying();assert.equal(started,1);audio.onended();assert.equal(ended,1);assert.deepEqual(revoked,['blob:test']);player.dispose();
});
