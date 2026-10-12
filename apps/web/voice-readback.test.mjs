import test from 'node:test';import assert from 'node:assert/strict';
import {createVoiceReadback,splitVoiceText} from './lib/voice-readback.mjs';
test('audio uses proven en-US native voice and reports actual start/finish instead of queued as success',()=>{
 const spoken=[],states=[],finished=[];
 class Utterance{constructor(text){this.text=text;}}
 const synth={speak(u){spoken.push(u);},cancel(){}};
 const player=createVoiceReadback({synthesis:synth,UtteranceClass:Utterance,onState:x=>states.push(x),
  onFinished:x=>finished.push(x),schedule:()=>1,clear:()=>{}});
 assert.equal(player.speak('Verified answer from VYNDI OS.'),true);
 assert.equal(spoken.length,1);assert.equal(spoken[0].lang,'en-US');
 assert.equal(states.some(x=>x==='SPEAKING'),false);
 spoken[0].onstart?.();assert.equal(states.at(-1),'SPEAKING');
 spoken[0].onend?.();
 assert.deepEqual(finished,['FINISHED']);assert.equal(player.active(),false);
});
test('speaker error and playback failure report reasons; microphone can resume',()=>{
 const events=[];class U{constructor(t){this.text=t;}}
 const synth={speak(u){this.last=u;},cancel(){}};
 const p=createVoiceReadback({synthesis:synth,UtteranceClass:U,onFinished:x=>events.push(x),onError:x=>events.push(x),schedule:()=>1,clear:()=>{}});
 assert.equal(p.speak('Readable diagnostic.'),true);
 synth.last.onerror?.({error:'voice-unavailable'});
 assert.equal(p.active(),false);
 assert.ok(events.includes('SPEECH_ERROR'));
 assert.ok(events.includes('ERROR'));
});
test('browser lacking speech synthesis returns false without throwing; manual response stays visible',()=>{
 const events=[];
 const p=createVoiceReadback({synthesis:null,UtteranceClass:null,onError:x=>events.push(x)});
 assert.equal(p.speak('Text response only.'),false);
 assert.equal(events[0],'SPEECH_UNAVAILABLE');
});
test('speaker start watchdog never strands the user in a silent listening state',()=>{
 const events=[],tasks=new Map();let seq=0;
 const scheduler=(fn)=>{const id=++seq;tasks.set(id,fn);return id};
 const clear=id=>tasks.delete(id);
 class U{constructor(t){this.text=t;}}
 const s={speak(){},cancel(){}};
 const p=createVoiceReadback({synthesis:s,UtteranceClass:U,onError:x=>events.push(x),onFinished:x=>events.push(x),schedule:scheduler,clear});
 p.speak('Speaker test.');
 assert.equal(tasks.size,1);
 const timeout=[...tasks.values()][0];timeout();
 assert.equal(p.active(),false);
 assert.deepEqual(events.slice(-2),['SPEECH_NOT_STARTED','ERROR']);
});
test('readback keeps bounded chunks, no irreversible audio queue and supports cancellation',()=>{
 const chunks=splitVoiceText('VAOS '.repeat(110));
 assert.ok(chunks.length>1);assert.ok(chunks.every(s=>s.length<=180&&s.trim()));
 let cancelled=0;const s={speak(){},cancel(){cancelled++;}};
 const p=createVoiceReadback({synthesis:s,UtteranceClass:class {constructor(s){this.text=s;}},schedule:()=>1,clear:()=>{}});
 assert.equal(p.speak('One short answer.'),true);p.cancel();
 assert.equal(p.active(),false);assert.equal(cancelled,1);
});
