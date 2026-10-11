import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createVoicePilotController} from './voice-pilot-controller.mjs';

test('push-to-talk captures final text only; no autonomous dispatch callback exists',()=>{
  let current;const observed=[];
  class Recognition {start(){current=this;} stop(){this.onend?.();} abort(){this.onend?.();}}
  const voice=createVoicePilotController({
    RecognitionClass:Recognition,
    onTranscript:(target,text)=>observed.push([target,text]),
  });
  assert.equal(voice.startListening('conversation-text',900),true);
  assert.equal(voice.startListening('conversation-text',900),false);
  current.onresult({results:[{isFinal:false,0:{transcript:'Ignored interim'}}]});
  assert.deepEqual(observed,[]);
  current.onresult({results:[{isFinal:true,0:{transcript:'Check frame production gate'}}]});
  assert.deepEqual(observed,[['conversation-text','Check frame production gate']]);
  assert.equal(voice.isListening(),false);
});

test('cancelled recognition ignores a late final result',()=>{
  let current;const observed=[];
  class Recognition {start(){current=this;}abort(){}}
  const voice=createVoicePilotController({
    RecognitionClass:Recognition,onTranscript:(target,text)=>observed.push([target,text]),
  });
  assert.equal(voice.startListening('instruction',2000),true);
  voice.stopListening();
  current.onresult({results:[{isFinal:true,0:{transcript:'Place a purchase order now'}}]});
  current.onerror?.({error:'aborted'});
  assert.deepEqual(observed,[]);
  assert.equal(voice.isListening(),false);
});

test('an expired recognition instance cannot alter a later dictation',()=>{
  const instances=[];const observed=[];
  class Recognition {start(){instances.push(this);}abort(){}stop(){}}
  const voice=createVoicePilotController({
    RecognitionClass:Recognition,onTranscript:(target,text)=>observed.push([target,text]),
  });
  voice.startListening('instruction',2000);
  voice.stopListening();
  voice.startListening('conversation-text',900);
  instances[0].onresult({results:[{isFinal:true,0:{transcript:'Stale result'}}]});
  instances[1].onresult({results:[{isFinal:true,0:{transcript:'Read latest mission report'}}]});
  assert.deepEqual(observed,[['conversation-text','Read latest mission report']]);
});

test('permission denied, unsupported browser, invalid target and speech start failure fail closed',()=>{
  const messages=[];
  class DeniedRecognition {start(){throw Error('Permission denied');}}
  const denied=createVoicePilotController({RecognitionClass:DeniedRecognition,onStatus:x=>messages.push(x)});
  assert.equal(denied.startListening('instruction',2000),false);
  assert.equal(denied.isListening(),false);
  assert.equal(denied.startListening('unexpected',900),false);
  assert.equal(denied.startListening('instruction',900),false);
  assert.equal(createVoicePilotController().startListening('instruction',2000),false);
  assert.ok(messages.some(x=>/could not start/.test(x)));
});

test('only read-only preview or explicitly unverified AI draft can be spoken',()=>{
  const spoken=[];
  class FakeUtterance{constructor(content){this.text=content;}}
  const voice=createVoicePilotController({
    SpeechSynthesisUtteranceClass:FakeUtterance,
    speechSynthesis:{speak(u){spoken.push(u.text);u.onstart?.();},cancel(){}},
  });
  assert.equal(voice.speak('draft','Business write executed'),false);
  assert.equal(spoken.length,0);
  const permitted='UNVERIFIED AI DRAFT — NOT AGENT EVIDENCE\nMission blocked on verification.\nNo business action authorized.';
  assert.equal(voice.speak('draft',permitted),true);
  assert.match(spoken[0],/No business action authorized\./);
  voice.stopSpeaking();
  assert.equal(voice.speak('preview','UNVERIFIED AI DRAFT — NOT AGENT EVIDENCE\nNo business action authorized.'),false);
});

test('voice browser UI is flag checked and contains no autonomous posting',async()=>{
  const script=await readFile(new URL('../voice-pilot-browser.mjs',import.meta.url),'utf8');
  const page=await readFile(new URL('../founder-console.html',import.meta.url),'utf8');
  for(const id of ['voice-instruction-start','voice-followup-start','voice-microphone-stop','voice-preview-speak','voice-draft-speak','voice-audio-stop']){
    assert.match(page,new RegExp('id="'+id+'"'));
  }
  assert.match(script,/\/api\/voice-capabilities/);
  assert.match(script,/createVoicePilotController/);
  assert.doesNotMatch(script,/fetch\(['"]\/api\/(?:intents|executions|approvals|founder-chat|founder-conversation)/);
  assert.doesNotMatch(script,/\.submit\s*\(/);
});
