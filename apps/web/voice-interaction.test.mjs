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
  constructor(){instances.push(this);}
  start(){}
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
  els['vaos-voice-mic'].click();
  assert.equal(instances.length,1);
  instances[0].onresult({results:[{isFinal:true,0:{transcript:'How many production job cards are recorded?'}}]});
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(requests.filter(x=>String(x).startsWith('/api/voice-insight?')).length,1);
  assert.match(els['vaos-voice-answer'].textContent,/source is presently unavailable/i);
  els['vaos-wake-toggle'].click();
  assert.equal(instances.length,2);
  instances[1].onresult({results:[{isFinal:true,0:{transcript:'Hey VAOS, what is our material shortage status?'}}]});
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(requests.filter(x=>String(x).startsWith('/api/voice-insight?')).length,2);
  assert.match(els['vaos-voice-answer'].textContent,/source is presently unavailable/i);
  assert.ok(instances.length>=3,'hands-free microphone should rearm after a completed question');
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
 assert.match(html,/main-voice\.mjs\?v=20261012-vedm-vibpe/);
 assert.match(script,/hey-vaos\.mjs\?v=20261012-handsfree-unified/);
});

test('main voice offering distinguishes the two controls in accessible copy',async()=>{
 const {readFile}=await import('node:fs/promises');
 const markup=await readFile(new URL('./workspace.html',import.meta.url),'utf8');
 assert.match(markup,/Enable hands-free voice/);
 assert.match(markup,/title="Ask once, then stop listening"/);
 assert.match(markup,/“Hey VAOS” is optional/);
});
