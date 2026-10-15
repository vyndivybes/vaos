import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createVoiceMultiTurnSession} from './voice-multiturn.mjs';
const MID='VAOS-CARBON-FRAME-S-20261010';
const record={mission:{id:MID,status:'HOLD'},workPackages:[
 {status:'BLOCKED'},{status:'BLOCKED'},{status:'PLANNED'}
]};
const status='What is the current mission status?';
const blockers='What about blockers?';

test('three explicitly initiated turns each read fresh matching mission and speak grounded focus, retaining no raw transcripts',async()=>{
 const calls=[],spoken=[],states=[];let clock=1000;
 const session=createVoiceMultiTurnSession({
  fetchSnapshot:async(id,{signal})=>{calls.push({id,signal});return record;},
  speak:(source,s)=>{spoken.push(s);return source==='preview';},
  now:()=>clock,
  onState:(s,m)=>states.push({s,m}),
 });
 assert.equal(session.open(MID),true);
 for(const question of [status,blockers,'Show progress for the mission']){
  assert.equal(session.ask(),true);
  assert.equal(await session.accept(question),true);
  assert.equal(session.state(),'SPOKEN_QUEUED');
  clock+=1000;
 }
 assert.deepEqual(calls.map(c=>c.id),[MID,MID,MID]);
 assert.equal(spoken.length,3);
 assert.match(spoken[1],/Blocked status entries: 2/);
 assert.match(spoken[1],/Question focus: blockers/);
 assert.match(spoken[2],/Question focus: progress/);
 assert.match(spoken[2],/No model invoked\. No action authorized\.$/);
 assert.deepEqual(session.context().map(x=>x.topic),['status','blockers','progress']);
 assert.equal(session.context().some(x=>Object.hasOwn(x,'transcript')),false);
 assert.equal(session.ask(),false,'limit is three turns per session');
 assert.equal(calls.length,3);
});

test('unsafe, ambiguous and authorization-request questions cannot read or speak',async()=>{
 let calls=0,spoken=0;
 const session=createVoiceMultiTurnSession({fetchSnapshot:async()=>{calls++;return record;},speak:()=>{spoken++;return true;}});
 assert.equal(session.open(MID),true);
 for(const request of ['Approve purchasing and show status','Delete data and report progress','Do that now','hello']){
  assert.equal(session.ask(),true);
  assert.equal(await session.accept(request),false);
 }
 assert.equal(calls,0);
 assert.equal(spoken,0);
});

test('cancel and mission change discard an in-flight response, including late completion',async()=>{
 let resolve,signal;const spoken=[];
 const session=createVoiceMultiTurnSession({
  fetchSnapshot:(_,options)=>{signal=options.signal;return new Promise(done=>{resolve=done;});},
  speak:(_,s)=>{spoken.push(s);return true;},
 });
 assert.equal(session.open(MID),true);
 assert.equal(session.ask(),true);
 const pending=session.accept(status);
 assert.equal(session.cancel(),true);
 assert.equal(signal.aborted,true);
 resolve(record);
 assert.equal(await pending,false);
 assert.deepEqual(spoken,[]);
 assert.equal(session.context().length,0);
});

test('five-minute TTL and mismatching evidence are fail-closed',async()=>{
 let time=1000,spoken=0;
 const session=createVoiceMultiTurnSession({now:()=>time,fetchSnapshot:async()=>record,speak:()=>{spoken++;return true;}});
 assert.equal(session.open(MID),true);
 time+=300001;
 assert.equal(session.ask(),false);
 assert.equal(session.state(),'EXPIRED');
 assert.equal(spoken,0);
 const wrong=createVoiceMultiTurnSession({fetchSnapshot:async()=>({mission:{id:'WRONG',status:'CLOSED'},workPackages:[]}),speak:()=>{spoken++;return true;}});
 assert.equal(wrong.open(MID),true);
 assert.equal(wrong.ask(),true);
 assert.equal(await wrong.accept(status),false);
 assert.equal(wrong.state(),'FAILED');
 assert.equal(spoken,0);
});

test('missing voice or network failure never claims spoken success, and never retries',async()=>{
 let attempts=0;
 const flow=createVoiceMultiTurnSession({fetchSnapshot:async()=>{attempts++;throw Error('secret network error');},speak:()=>true});
 assert.equal(flow.open(MID),true);
 assert.equal(flow.ask(),true);
 assert.equal(await flow.accept(status),false);
 assert.equal(attempts,1);
 assert.equal(flow.state(),'FAILED');
 const failedSpeech=createVoiceMultiTurnSession({fetchSnapshot:async()=>record,speak:()=>false});
 assert.equal(failedSpeech.open(MID),true);
 assert.equal(failedSpeech.ask(),true);
 assert.equal(await failedSpeech.accept(status),false);
 assert.equal(failedSpeech.context().length,0);
 assert.equal(failedSpeech.state(),'FAILED');
});

test('Stage V3 UI is separately flagged, authenticated GET-only, and no persistent transcripts',async()=>{
 const page=await readFile(new URL('../founder-console.html',import.meta.url),'utf8');
 const browser=await readFile(new URL('../voice-pilot-browser.mjs',import.meta.url),'utf8');
 const assets=await readFile(new URL('../.assetsignore',import.meta.url),'utf8');
 for(const id of ['voice-v3-open','voice-v3-ask','voice-v3-stop','voice-v3-status','voice-v3-report','voice-v3-question'])
  assert.match(page,new RegExp('id="'+id+'"'));
 assert.match(browser,/createVoiceMultiTurnSession/);
 assert.match(browser,/multiTurnEnabled===true/);
 assert.match(browser,/method:'GET'/);
 assert.match(browser,/credentials:'same-origin'/);
 assert.match(browser,/voice\.startListening\('voice-v3-question',900\)/);
 assert.match(assets,/!lib\/voice-multiturn\.mjs/);
 assert.match(browser,/\/api\/voice-ai-focus/);
 assert.doesNotMatch(browser,/localStorage|sessionStorage|setInterval|\/api\/(?:executions|approvals|intents|founder-conversation)/);
});


test('AI focus mode produces evidence-only voice readback without model prose as authority',async()=>{
 const calls=[],spoken=[];
 const session=createVoiceMultiTurnSession({
  fetchSnapshot:async()=>record,
  classifyFocus:async(q,prior,{signal})=>{
   calls.push({q,prior,signal});
   return {topics:['status','blockers'],modelInvoked:true,actionAuthorized:false};
  },
  speak:(source,s)=>{spoken.push({source,s});return true;},
 });
 assert.equal(session.open(MID,{ai:true}),true);
 assert.equal(session.ask(),true);
 assert.equal(await session.accept(status),true);
 assert.equal(calls.length,1);
 assert.equal(spoken[0].source,'ai-preview');
 assert.match(spoken[0].s,/AI-ASSISTED READ-ONLY PREVIEW/);
 assert.match(spoken[0].s,/Status reported by VAOS: HOLD/);
 assert.match(spoken[0].s,/Blocked status entries: 2/);
 assert.match(spoken[0].s,/Model classified topics only\. No business action authorized\.$/);
 assert.equal(session.context()[0].topic,'status');
});

test('AI mode rejects missing or forged classifier response and does not fallback to unverified text',async()=>{
 let spoken=0;
 const unsafe=createVoiceMultiTurnSession({fetchSnapshot:async()=>record,
   classifyFocus:async()=>({topics:['execute'],modelInvoked:true,actionAuthorized:false}),
   speak:()=>{spoken++;return true;}
 });
 assert.equal(unsafe.open(MID,{ai:true}),true);
 assert.equal(unsafe.ask(),true);
 assert.equal(await unsafe.accept(status),false);
 assert.equal(spoken,0);
 const noClassifier=createVoiceMultiTurnSession({fetchSnapshot:async()=>record,speak:()=>{spoken++;return true;}});
 assert.equal(noClassifier.open(MID,{ai:true}),false);
});

test('cancel during AI classification disarms late reply, leaving no spoken result',async()=>{
 let finish,aborted,spoken=0;
 let markStarted;const started=new Promise(resolve=>{markStarted=resolve;});
 const flow=createVoiceMultiTurnSession({
   fetchSnapshot:async()=>record,
   classifyFocus:(_q,_prior,{signal})=>{aborted=signal;markStarted();return new Promise(resolve=>{finish=resolve;});},
   speak:()=>{spoken++;return true;},
 });
 assert.equal(flow.open(MID,{ai:true}),true);
 assert.equal(flow.ask(),true);
 const pending=flow.accept(status);
 await started;
 assert.equal(flow.cancel(),true);
 assert.equal(aborted?.aborted,true);
 finish({topics:['status'],modelInvoked:true,actionAuthorized:false});
 assert.equal(await pending,false);
 assert.equal(spoken,0);
});
