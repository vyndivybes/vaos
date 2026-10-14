import test from 'node:test';
import assert from 'node:assert/strict';

test('explicit microphone click and recognized question dispatch one bounded read-only request and display the result',async()=>{
 const original={document:globalThis.document,window:globalThis.window,fetch:globalThis.fetch};
 const callbacks=new Map(),instances=[],requests=[];
 function el(id){
  const listeners=new Map();
  return {id,listeners,disabled:false,checked:false,value:'',textContent:'',
   dataset:{},attributes:{},
   addEventListener(name,fn){listeners.set(name,fn);},
   setAttribute(name,v){this.attributes[name]=v;},
   replaceChildren(){},append(){},
   click(){const f=listeners.get('click');if(f)return f({type:'click'});},
  };
 }
 const names=['vaos-voice-mic','vaos-voice-stop','vaos-voice-ask','vaos-voice-speak',
   'vaos-voice-question','vaos-voice-answer','vaos-voice-status','vaos-voice-sources',
   'vaos-voice-speech-toggle','vaos-wake-toggle','vaos-wake-indicator','vaos-wake-status','vaos-voice-test'];
 const els=Object.fromEntries(names.map(n=>[n,el(n)]));
 const root={querySelector(s){return els[s.slice(1)]||null;}};
 class Recognition{
  processLocally=false;
  static async available(){return 'available';}
  constructor(){instances.push(this);}
  start(){this.started=true;}
  stop(){this.onend?.();}
  abort(){this.onend?.();}
 }
 globalThis.document={visibilityState:'visible',querySelector(q){return q==='#vaos-main-voice'?root:null;},
  addEventListener(name,fn){callbacks.set(name,fn);}};
 globalThis.window={SpeechRecognition:Recognition,addEventListener(){},
  speechSynthesis:{cancel(){},speak(){}},SpeechSynthesisUtterance:class {}};
 globalThis.fetch=async(url)=>{
  requests.push(url);
  if(url==='/api/voice-capabilities')return {ok:true,json:async()=>({data:{
   enabled:true,manualReviewRequired:true,actionAuthorized:false,
   agentDispatch:false,automaticSubmission:false,serverAudioEnabled:false}})};
  return {ok:true,json:async()=>({data:{status:'HOLD',readOnly:true,actionAuthorized:false,
   sourceSystem:'VAOS_INTELLIGENCE',answer:'The source is presently unavailable. No work was changed.'}})};
 };
 try{
  await import('./main-voice.mjs?microphone-acceptance-20261012');
  await new Promise(resolve=>setTimeout(resolve,0));
  await els['vaos-voice-mic'].click();
  assert.equal(instances.filter(r=>r.started).length,1);
  instances[0].onresult({results:[{isFinal:true,0:{transcript:'How many production job cards are recorded?'}}]});
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(requests.filter(x=>String(x).startsWith('/api/voice-insight?')).length,1);
  assert.match(els['vaos-voice-answer'].textContent,/source is presently unavailable/i);
  await els['vaos-wake-toggle'].click();
  assert.equal(instances.filter(r=>r.started).length,2);
  assert.equal(instances.at(-1).processLocally,true);
  instances.at(-1).onresult({results:[{isFinal:true,0:{transcript:'Hey VAOS, what is our material shortage status?'}}]});
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(requests.filter(x=>String(x).startsWith('/api/voice-insight?')).length,2);
  assert.match(els['vaos-voice-answer'].textContent,/source is presently unavailable/i);
  assert.ok(instances.filter(r=>r.started).length>=3,'hands-free microphone should rearm after a completed question');
  instances.at(-1).onresult({results:[{isFinal:true,0:{transcript:'What is our production status?'}}]});
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(requests.filter(x=>String(x).startsWith('/api/voice-insight?')).length,3,
    'direct, supported question in hands-free mode should use the existing Ask VAOS answer path');
  assert.match(els['vaos-voice-answer'].textContent,/source is presently unavailable/i);
 }finally{Object.assign(globalThis,original);}
});

test('active Hey VAOS status is observable and final recognition has explicit diagnostics',async()=>{
 const {readFile}=await import('node:fs/promises');
 const source=await readFile(new URL('./lib/hey-vaos.mjs',import.meta.url),'utf8');
 assert.match(source,/onHeard/);
 assert.match(source,/transcript/);
});

test('current voice handoff module and wake listener use distinct cache-busted production URLs',async()=>{
 const {readFile}=await import('node:fs/promises');
 const html=await readFile(new URL('./workspace.html',import.meta.url),'utf8');
 const script=await readFile(new URL('./main-voice.mjs',import.meta.url),'utf8');
 assert.match(html,/main-voice\.mjs\?v=202610\d{2}-[a-z0-9-]+/);
 assert.match(script,/hey-vaos\.mjs\?v=20261012-handsfree-unified/);
});

test('main voice offering distinguishes the two controls in accessible copy',async()=>{
 const {readFile}=await import('node:fs/promises');
 const markup=await readFile(new URL('./workspace.html',import.meta.url),'utf8');
 assert.match(markup,/Enable hands-free voice/);
 assert.match(markup,/title="Ask once, then stop listening"/);
 assert.match(markup,/“Hey VAOS” is optional/);
});

test('disabled microphone shows an actionable diagnosis without requesting mic access during page load',async()=>{
 const {readFile}=await import('node:fs/promises');
 const source=await readFile(new URL('./main-voice.mjs',import.meta.url),'utf8');
 const html=await readFile(new URL('./workspace.html',import.meta.url),'utf8');
 assert.match(html,/id="vaos-voice-mic-check"/);
 assert.match(html,/id="vaos-voice-mic-diagnostic"/);
 assert.match(source,/await refreshVoiceCapability\(\)/);
 assert.match(source,/probeMicrophonePermission/);
 assert.match(source,/micCheck\?\.addEventListener\('click'/);
 assert.match(source,/micDiagnostic\.textContent=micState\.message/);
 assert.match(source,/mic\.disabled=!micState\.mayListen/);
 assert.doesNotMatch(source,/getUserMedia\(\{audio:true/);
});



test('G6 app wires prior successful read into the existing question flow, never stores transcripts, and clears on explicit Stop',async()=>{
 const {readFile}=await import('node:fs/promises');
 const app=await readFile(new URL('./main-voice.mjs',import.meta.url),'utf8');
 const source=await readFile(new URL('./lib/g6-conversation.mjs',import.meta.url),'utf8');
 assert.match(app,/createG6Conversation/);
 assert.match(app,/conversation\.resolve\(input\.value\)/);
 assert.match(app,/conversation\.remember\(intent,normalized\.status/);
 assert.match(app,/conversation\.clear\(\)/);
 assert.match(app,/canFollowUp/);
 assert.match(app,/createG6BargeInListener/);
 assert.match(source,/classifyG6Interruption/);
 assert.match(app,/player\.cancel\(\)/);
 assert.match(app,/localSpeech\?\.status!=='LOCAL_READY'/);
 assert.match(source,/MAX_FOLLOWUPS=3/);
 assert.match(source,/TTL_MS=300000/);
 assert.doesNotMatch(source,/sessionStorage|localStorage|indexedDB|\/api\/.*POST|fetch\(/);
});


test('G6: pressing Stop during spoken readback keeps bounded context for two real mission follow-up GETs',async()=>{
 const saved={document:globalThis.document,window:globalThis.window,fetch:globalThis.fetch};
 const requests=[],speech={utterances:[],cancels:0};
 const el=id=>{
  const listeners=new Map();
  return {id,listeners,checked:false,disabled:false,value:'',textContent:'',dataset:{},
   attributes:{},className:'',addEventListener(name,fn){listeners.set(name,fn);},
   setAttribute(name,value){this.attributes[name]=value;},
   replaceChildren(){},append(){},
   click(){return listeners.get('click')?.({type:'click'});}
  };
 };
 const ids=['vaos-voice-mic','vaos-voice-stop','vaos-voice-ask','vaos-voice-speak',
  'vaos-voice-question','vaos-voice-answer','vaos-voice-status','vaos-voice-sources',
  'vaos-voice-speech-toggle','vaos-wake-toggle','vaos-wake-indicator',
  'vaos-wake-status','vaos-voice-test'];
 const nodes=Object.fromEntries(ids.map(id=>[id,el(id)]));
 nodes['vaos-voice-speech-toggle'].checked=true;
 const root={querySelector(s){return nodes[s.slice(1)]||null;}};
 globalThis.document={visibilityState:'visible',querySelector:s=>s==='#vaos-main-voice'?root:null,
  addEventListener(){}};
 class Recognition{
  processLocally=false;
  static async available(){return 'available';}
  start(){}
  abort(){this.onend?.();}
  stop(){this.onend?.();}
 }
 globalThis.window={isSecureContext:true,SpeechRecognition:Recognition,addEventListener(){},
  speechSynthesis:{
   cancel(){speech.cancels++;},
   speak(utterance){speech.utterances.push(utterance);utterance.onstart?.();}
  },
  SpeechSynthesisUtterance:class{constructor(value){this.text=value;}}
 };
 globalThis.fetch=async(url)=>{
  requests.push(String(url));
  if(url==='/api/voice-capabilities')return {ok:true,json:async()=>({data:{
   enabled:true,manualReviewRequired:true,actionAuthorized:false,
   agentDispatch:false,automaticSubmission:false,serverAudioEnabled:false,
  }})};
  return {ok:true,json:async()=>({data:{
   schemaVersion:'VAOS_FOUNDER_MISSION_ANSWER_V1',sourceSystem:'VAOS_MISSION_CONTROL',
   sourceAuthority:'vaos_founder_mission_answer_summary',
   status:'OBSERVED',readOnly:true,actionAuthorized:false,businessEffectsExecuted:false,
   answer:'Eight persisted missions observed: two have unfinished work, five await closure, and one is cancelled. No business changes were performed.',
  }})};
 };
 try{
  await import('./main-voice.mjs?g6-live-followup-after-voice-stop-20261015');
  await new Promise(resolve=>setTimeout(resolve,0));
  nodes['vaos-voice-question'].value='“Which assigned missions remain unfinished?”';
  await nodes['vaos-voice-ask'].click();
  assert.match(nodes['vaos-voice-answer'].textContent,/Eight persisted missions/);
  assert.ok(speech.utterances.length>0,'first spoken answer should be active');
  const first=requests.filter(s=>s.startsWith('/api/voice-insight?'));
  assert.equal(first.length,1);
  assert.match(decodeURIComponent(first[0]),/Which assigned missions remain unfinished/);

  await nodes['vaos-voice-stop'].click();
  assert.ok(speech.cancels>0,'Stop must cancel speech');
  assert.match(nodes['vaos-voice-status'].textContent,/spoken answer stopped/i);
  nodes['vaos-voice-question'].value='And the blockers?';
  await nodes['vaos-voice-ask'].click();
  const second=requests.filter(s=>s.startsWith('/api/voice-insight?'));
  assert.equal(second.length,2);
  assert.match(decodeURIComponent(second[1]),/Which assigned missions remain unfinished and what blockers are recorded/);
  assert.match(nodes['vaos-voice-answer'].textContent,/Eight persisted missions/,'follow-up must show a grounded answer');

  nodes['vaos-voice-question'].value='And the latest result';
  await nodes['vaos-voice-ask'].click();
  const third=requests.filter(s=>s.startsWith('/api/voice-insight?'));
  assert.equal(third.length,3);
  assert.match(decodeURIComponent(third[2]),/latest completed departmental mission/);
  assert.doesNotMatch(decodeURIComponent(third[2]),/q=And the latest result/);

  // Unlike playback-only Stop, stopping while hands-free listening is enabled
  // must discard the short-lived conversation for privacy and consent.
  await nodes['vaos-wake-toggle'].click();
  await nodes['vaos-voice-stop'].click();
  assert.match(nodes['vaos-voice-status'].textContent,/Conversation context cleared/);
  nodes['vaos-voice-question'].value='And the blockers?';
  await nodes['vaos-voice-ask'].click();
  const fourth=requests.filter(x=>x.startsWith('/api/voice-insight?'));
  assert.equal(fourth.length,4);
  assert.match(decodeURIComponent(fourth[3]),/q=And the blockers/);
  assert.doesNotMatch(decodeURIComponent(fourth[3]),/Which assigned missions remain unfinished and what blockers/);

 }finally{
  Object.assign(globalThis,saved);
 }
});


test('G6: existing voice UI manages long-reply barge-in through local-only consent and VAD, not remote speech fallback',async()=>{
 const {readFile}=await import('node:fs/promises');
 const app=await readFile(new URL('./main-voice.mjs',import.meta.url),'utf8');
 const module=await readFile(new URL('./lib/g6-conversation.mjs',import.meta.url),'utf8');
 assert.match(app,/getLocalLocale:\(\)=>localSpeech\?\.status==='LOCAL_READY'/);
 assert.match(app,/isOptedIn:\(\)=>wake\?\.isEnabled\(\)===true&&document\.visibilityState==='visible'/);
 assert.match(app,/isSpeechActive:\(\)=>player\.active\(\)/);
 assert.match(app,/function stopInterruption\(\)\{ondeviceBarge\.stop\(\);\}/);
 assert.match(app,/function startInterruption\(\)\{ondeviceBarge\.start\(\);\}/);
 assert.match(module,/recognition\.processLocally=true/);
 assert.match(module,/onActivity\('SPEECH_START'\)/);
 assert.match(module,/onActivity\('SPEECH_END'\)/);
 assert.doesNotMatch(module,/fetch\(|localStorage|sessionStorage|navigator\.mediaDevices\.getUserMedia/);
});
