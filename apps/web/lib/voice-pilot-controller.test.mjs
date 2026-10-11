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

test('speech uses native en-US without explicitly selecting a potentially silent installed voice',()=>{
  let current;
  class FakeUtterance {constructor(text){this.text=text;current=this;}}
  const voice=createVoicePilotController({
    SpeechSynthesisUtteranceClass:FakeUtterance,
    speechSynthesis:{
      getVoices:()=>[{name:'Windows English',lang:'en-US',default:true}],
      speak:()=>{},
      cancel:()=>{},
    },
  });
  const content='UNVERIFIED AI DRAFT — NOT AGENT EVIDENCE\nSimulation only.\nNo business action authorized.';
  assert.equal(voice.speak('draft',content),true);
  assert.equal(current.voice,undefined);
  assert.equal(current.lang,'en-US');
});

test('audio playback confirms actual onstart rather than immediately claiming success',()=>{
  let queued, canceled=0;const states=[];
  class FakeUtterance {constructor(text){this.text=text;}}
  const engine={getVoices:()=>[],speaking:false,pending:false,speak:u=>{queued=u;},cancel:()=>{canceled++;}};
  const voice=createVoicePilotController({
    SpeechSynthesisUtteranceClass:FakeUtterance,
    speechSynthesis:engine,
    onStatus:x=>states.push(x),
  });
  const content='UNVERIFIED AI DRAFT — NOT AGENT EVIDENCE\nSimulation only.\nNo business action authorized.';
  assert.equal(voice.speak('draft',content),true);
  assert.equal(canceled,0,'do not cancel the idle engine immediately before speech starts');
  assert.equal(states.some(x=>/playback started/i.test(x)),false);
  queued.onstart();
  assert.equal(states.some(x=>/playback started/i.test(x)),true);
  queued.onend();
  assert.equal(states.at(-1).includes('finished'),true);
});

test('speech errors explain the actual browser failure without claiming playback',()=>{
  let queued;const states=[];
  class FakeUtterance {constructor(text){this.text=text;}}
  const voice=createVoicePilotController({
    SpeechSynthesisUtteranceClass:FakeUtterance,
    speechSynthesis:{getVoices:()=>[],speak:u=>{queued=u;},cancel(){}},
    onStatus:x=>states.push(x),
  });
  const content='UNVERIFIED AI DRAFT — NOT AGENT EVIDENCE\nSimulation only.\nNo business action authorized.';
  assert.equal(voice.speak('draft',content),true);
  queued.onerror({error:'language-unavailable'});
  assert.match(states.at(-1),/language-unavailable/i);
  assert.match(states.at(-1),/voice|speaker|audio/i);
});

test('long reply is spoken in sequential bounded chunks, with the disclaimer retained',()=>{
 const queued=[];const status=[];
 class Utterance{constructor(text){this.text=text;}}
 const synth={getVoices:()=>[{lang:'en-US',default:true}],speak:u=>queued.push(u),cancel(){}};
 const voice=createVoicePilotController({SpeechSynthesisUtteranceClass:Utterance,speechSynthesis:synth,onStatus:x=>status.push(x)});
 const content='UNVERIFIED AI DRAFT — NOT AGENT EVIDENCE\n'+('The prototype remains in engineering review. '.repeat(35))+'\nNo business action authorized.';
 assert.equal(voice.speak('draft',content),true);
 assert.equal(queued.length,1);
 assert.ok(queued[0].text.length<=180);
 let index=0;
 while(index<queued.length && index<100){const current=queued[index++];current.onstart();current.onend();}
 assert.ok(queued.length>3);
 assert.ok(queued.every(u=>u.text.length<=180));
 assert.match(queued.map(u=>u.text).join(' '),/No business action authorized\./);
 assert.match(status.at(-1),/finished/i);
});

test('stop speaking prevents subsequent chunks and ignores late completion callbacks',()=>{
 const queued=[];let cancellations=0;
 class Utterance{constructor(text){this.text=text;}}
 const voice=createVoicePilotController({SpeechSynthesisUtteranceClass:Utterance,
 speechSynthesis:{getVoices:()=>[],speak:u=>queued.push(u),cancel(){cancellations++;}}});
 const content='UNVERIFIED AI DRAFT — NOT AGENT EVIDENCE\n'+('Under review and not approved. '.repeat(30))+'\nNo business action authorized.';
 assert.equal(voice.speak('draft',content),true);
 const first=queued[0];voice.stopSpeaking();first.onend();
 assert.equal(queued.length,1);
 assert.equal(cancellations,1);
});
