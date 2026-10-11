import test from 'node:test';
import assert from 'node:assert/strict';
import {createOneShotVoiceConversation} from './voice-one-shot.mjs';

const missionId='VAOS-CARBON-FRAME-S-20261010';
const snapshot={mission:{id:missionId,status:'HOLD'},workPackages:[
  {status:'BLOCKED'},{status:'BLOCKED'},{status:'PLANNED'}
]};

test('one deliberate push-to-talk can fetch one exact read-only snapshot then queue one grounded reply',async()=>{
  const calls=[],reports=[],states=[],spoken=[];
  const flow=createOneShotVoiceConversation({
    fetchSnapshot:async (id,options)=>{calls.push({id,options});return snapshot;},
    speak:(source,text)=>{spoken.push({source,text});return true;},
    onReport:s=>reports.push(s),onState:(state,msg)=>states.push({state,msg}),
  });
  assert.equal(flow.begin(missionId),true);
  assert.equal(flow.begin(missionId),false,'do not admit concurrent audio requests');
  assert.equal(await flow.acceptTranscript('What is the current status and blockers for this mission?'),true);
  assert.equal(calls.length,1);
  assert.equal(calls[0].id,missionId);
  assert.equal(calls[0].options.signal.aborted,false);
  assert.equal(spoken.length,1);
  assert.equal(spoken[0].source,'preview');
  assert.match(spoken[0].text,/Mission: VAOS-CARBON-FRAME-S-20261010/);
  assert.match(spoken[0].text,/Status reported by VAOS: HOLD/);
  assert.match(spoken[0].text,/No model invoked\. No action authorized\.$/);
  assert.equal(reports.length,1);
  assert.equal(states.at(-1).state,'SPOKEN_QUEUED');
  assert.equal(flow.state(),'SPOKEN_QUEUED');
});

test('unsafe, ambiguous, blank, and malformed questions never trigger evidence reads',async()=>{
  let calls=0;
  const flow=createOneShotVoiceConversation({
    fetchSnapshot:async()=>{calls++;return snapshot;},
    speak:()=>true,
  });
  for(const q of ['hello','approve this purchase and report status','dispatch status now','delete mission status','show the projects','']) {
    assert.equal(flow.begin(missionId),true);
    assert.equal(await flow.acceptTranscript(q),false);
  }
  assert.equal(calls,0);
  assert.equal(flow.begin('fake id with spaces'),false);
});

test('cancel during async read aborts one request and discards late evidence',async()=>{
  let finish,signal;const spoken=[];
  const flow=createOneShotVoiceConversation({
    fetchSnapshot:(id,options)=>{signal=options.signal;return new Promise(resolve=>{finish=resolve;});},
    speak:(_,message)=>{spoken.push(message);return true;},
  });
  assert.equal(flow.begin(missionId),true);
  const pending=flow.acceptTranscript('What is the mission status?');
  assert.equal(flow.cancel(),true);
  assert.equal(signal.aborted,true);
  finish(snapshot);
  assert.equal(await pending,false);
  assert.deepEqual(spoken,[]);
  assert.equal(flow.state(),'IDLE');
});

test('invalid or mismatched evidence fails closed, with no spoken success claim',async()=>{
  let spoken=0;
  const flow=createOneShotVoiceConversation({
    fetchSnapshot:async()=>({mission:{id:'OTHER',status:'COMPLETED'},workPackages:[]}),
    speak:()=>{spoken++;return true;},
  });
  assert.equal(flow.begin(missionId),true);
  assert.equal(await flow.acceptTranscript('What is the mission status?'),false);
  assert.equal(spoken,0);
  assert.equal(flow.state(),'FAILED');
});

test('read failure, speech failure and absent setup never retry or claim success',async()=>{
  let calls=0;const reported=[];
  const flow=createOneShotVoiceConversation({
    fetchSnapshot:async()=>{calls++;throw new Error('network detail must not leak');},
    speak:()=>true,onState:(state,text)=>reported.push([state,text]),
  });
  assert.equal(flow.begin(missionId),true);
  assert.equal(await flow.acceptTranscript('What is the status?'),false);
  assert.equal(calls,1);
  assert.equal(flow.state(),'FAILED');
  assert.doesNotMatch(reported.at(-1)[1],/network detail/);
  const silent=createOneShotVoiceConversation({fetchSnapshot:async()=>snapshot,speak:()=>false});
  assert.equal(silent.begin(missionId),true);
  assert.equal(await silent.acceptTranscript('What is the status?'),false);
  assert.equal(silent.state(),'FAILED');
  assert.throws(()=>createOneShotVoiceConversation({}),/REQUIRED/);
});

test('client module is founder-flag gated, GET-only, and no continuous listening',async()=>{
  const {readFile}=await import('node:fs/promises');
  const client=await readFile(new URL('../voice-pilot-browser.mjs',import.meta.url),'utf8');
  const page=await readFile(new URL('../founder-console.html',import.meta.url),'utf8');
  const ignore=await readFile(new URL('../.assetsignore',import.meta.url),'utf8');
  for(const id of ['voice-one-shot-start','voice-one-shot-stop','voice-one-shot-status','voice-one-shot-report'])
    assert.match(page,new RegExp('id="'+id+'"'));
  assert.match(client,/createOneShotVoiceConversation/);
  assert.match(client,/oneShotEnabled===true/);
  assert.match(client,/\/api\/missions\?missionId=/);
  assert.match(client,/credentials:'same-origin'/);
  assert.match(client,/method:'GET'/);
  assert.match(client,/voice\.startListening\('voice-one-shot-question',900\)/);
  assert.match(ignore,/!lib\/voice-one-shot\.mjs/);
  assert.doesNotMatch(client,/setInterval|startContinuous|method:'POST'/);
});
