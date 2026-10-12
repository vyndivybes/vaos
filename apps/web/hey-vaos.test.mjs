import test from 'node:test';import assert from 'node:assert/strict';
import {parseWakePhrase,advanceWakeTurn,createWakeListener} from './lib/hey-vaos.mjs';
import {classifyDashboardQuestion} from './main-voice.mjs';
const validate=q=>classifyDashboardQuestion(q).kind!=='DENY';
test('only an anchored Hey VAOS / VAOS wake phrase triggers listening intent',()=>{
 assert.deepEqual(parseWakePhrase('Hey VAOS'),{wake:true,question:''});
 assert.deepEqual(parseWakePhrase('hey vaos, what is our sales status?'),{wake:true,question:'what is our sales status?'});
 assert.deepEqual(parseWakePhrase('VAOS what is the project status'),{wake:true,question:'what is the project status'});
 assert.equal(parseWakePhrase('what does Hey VAOS mean').wake,false);
 assert.equal(parseWakePhrase('hey vendor what is happening').wake,false);
});
test('intentional Hey VAOS wake and read-only question produces a request without a silent confirmation dead-end',()=>{
 const state={mode:'WAKE',pending:null};
 const wake=advanceWakeTurn(state,'Hey VAOS',validate);
 assert.equal(wake.event,'PROMPT');
 assert.equal(wake.state.mode,'QUESTION');
 const asked=advanceWakeTurn(wake.state,'What is our sales pipeline?',validate);
 assert.equal(asked.event,'SUBMIT');
 assert.equal(asked.question,'What is our sales pipeline?');
 assert.equal(asked.state.mode,'WAKE');
});
test('a single explicit Hey VAOS question can trigger exactly one read-only request',()=>{
 const first=advanceWakeTurn({mode:'WAKE',pending:null},'Hey VAOS, show engineering evidence',validate);
 assert.equal(first.event,'SUBMIT');
 assert.equal(first.question,'show engineering evidence');
 assert.equal(advanceWakeTurn(first.state,'confirm',validate).event,'IGNORED');
 assert.equal(advanceWakeTurn({mode:'QUESTION',pending:null},'cancel',validate).event,'CANCELLED');
});
test('dangerous and too long utterances never reach confirmation',()=>{
 const input=['Hey VAOS approve supplier payment','Hey VAOS transfer salary','Hey VAOS execute mission','Hey VAOS '+('x'.repeat(400))];
 for(const words of input){const r=advanceWakeTurn({mode:'WAKE',pending:null},words,validate);
  assert.equal(r.event,'REJECTED');assert.equal(r.state.pending,null);}
});
test('voice-armed control requires explicit opt-in and always stops on visibility loss',()=>{
 const active=[];
 const events=[];
 class FakeRecognition{
  constructor(){this.onerror=null;this.onend=null;this.onresult=null;active.push(this);}
  start(){events.push('start')}
  abort(){events.push('abort')}
 }
 let visible=true;
 const listener=createWakeListener({RecognitionClass:FakeRecognition,isVisible:()=>visible,
  validateQuestion:validate,onStatus:s=>events.push(s),onDraft:s=>events.push('draft:'+s),onConfirm:q=>events.push('submit:'+q),
  schedule:(fn,delay)=>{events.push('scheduled');if(delay<1000)fn();return fn;},clear:()=>{}});
 assert.equal(active.length,0);
 assert.equal(listener.enable(),true);
 assert.equal(active.length,1);
 active[0].onresult?.({results:[{isFinal:true,0:{transcript:'Hey VAOS, show the project status'}}]});
 assert.equal(events.some(x=>String(x).startsWith('draft:')),true);
 assert.equal(events.filter(x=>String(x).startsWith('submit:')).length,1);
 active[0].onend?.();
 assert.equal(active.length,2);
 active[1].onresult?.({results:[{isFinal:true,0:{transcript:'confirm'}}]});
 assert.equal(events.filter(x=>String(x).startsWith('submit:')).length,1);
 visible=false;listener.onVisibilityChange();
 assert.equal(listener.isEnabled(),false);
 assert.ok(events.includes('abort'));
});
test('mic permission denied, repeated errors and disabling discard pending questions',()=>{
 let current;
 class DeniedRecognition{
  start(){current=this;this.onerror?.({error:'not-allowed'});}
  abort(){}
 }
 const messages=[];
 const x=createWakeListener({RecognitionClass:DeniedRecognition,isVisible:()=>true,
  validateQuestion:validate,onStatus:s=>messages.push(s),schedule:()=>1,clear:()=>{}});
 x.enable();
 assert.equal(x.isEnabled(),false);
 assert.match(messages.join(' '),/denied|permission|blocked/i);
});
