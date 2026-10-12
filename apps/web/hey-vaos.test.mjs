import test from 'node:test';import assert from 'node:assert/strict';
import {parseWakePhrase,advanceWakeTurn,createWakeListener} from './lib/hey-vaos.mjs';
import {classifyDashboardQuestion} from './main-voice.mjs';
const validate=q=>classifyDashboardQuestion(q).kind!=='DENY';
test('only an anchored Hey VAOS / VAOS wake phrase triggers listening intent',()=>{
 assert.deepEqual(parseWakePhrase('Hey VAOS'),{wake:true,question:''});
 assert.deepEqual(parseWakePhrase('hey vaos, what is our sales status?'),{wake:true,question:'what is our sales status?'});
 assert.deepEqual(parseWakePhrase('VAOS what is the project status'),{wake:true,question:'what is the project status'});
 assert.deepEqual(parseWakePhrase('Hey Vayos, tell me sales status'),{wake:true,question:'tell me sales status'});
 assert.deepEqual(parseWakePhrase('Hey Vayus, how many job cards?'),{wake:true,question:'how many job cards?'});
 assert.deepEqual(parseWakePhrase('Hey VA OS, show procurement status'),{wake:true,question:'show procurement status'});
 assert.deepEqual(parseWakePhrase('Hey V A O S what is the project status'),{wake:true,question:'what is the project status'});
 assert.deepEqual(parseWakePhrase('Hey Vay os, show engineering status'),{wake:true,question:'show engineering status'});
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
 assert.equal(active.length,1,'wake should remain paused while the answer is retrieved');
 listener.resume();
 assert.equal(active.length,2,'listener rearms after the reply is finished');
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

test('hands-free opt-in accepts a direct read-only business question without a difficult wake phrase',()=>{
 const allow=q=>/^(what|how|which|show|tell me|give me|list|do we|are there)\b/i.test(q) && validate(q);
 const result=advanceWakeTurn({mode:'WAKE',pending:null},'What are our material shortages?',validate,{acceptDirectQuestion:allow});
 assert.equal(result.event,'SUBMIT');
 assert.equal(result.question,'What are our material shortages?');
 assert.equal(result.state.mode,'WAKE');
 assert.equal(advanceWakeTurn({mode:'WAKE',pending:null},'What are our material shortages?',validate).event,'IGNORED');
});
test('hands-free mode ignores ambient chatter and blocks dangerous instructions',()=>{
 const allow=q=>/^(what|how|which|show|tell me|give me|list|do we|are there)\b/i.test(q)&&validate(q);
 for(const sentence of ['We need to discuss the inventory tomorrow','I am talking about stock right now','Approve the supplier payment','Send invoices to everyone']){
  const result=advanceWakeTurn({mode:'WAKE',pending:null},sentence,validate,{acceptDirectQuestion:allow});
  assert.notEqual(result.event,'SUBMIT',sentence);
 }
});
test('recognition in opted-in hands-free mode sends exactly one direct business question and pauses microphone before request',()=>{
 const listeners=[],events=[];
 class Speech{
  constructor(){listeners.push(this);}
  start(){events.push('listening');}
  abort(){events.push('aborted');}
 }
 let visible=true;const x=createWakeListener({RecognitionClass:Speech,isVisible:()=>visible,
  validateQuestion:validate,acceptDirectQuestion:q=>/^(what|how|which|show)\b/i.test(q)&&validate(q),
  onDraft:q=>events.push('draft:'+q),
  onConfirm:q=>events.push('request:'+q),onStatus:s=>events.push('status:'+s),
  schedule:()=>1,clear:()=>{}});
 assert.equal(x.enable(),true);
 listeners[0].onresult({results:[{isFinal:true,0:{transcript:'What is our production status?'}}]});
 assert.deepEqual(events.filter(e=>e.startsWith('request:')),['request:What is our production status?']);
 assert.equal(x.state().paused,true);
 assert.ok(events.indexOf('aborted')<events.indexOf('request:What is our production status?'));
 x.resume();
 assert.equal(x.state().paused,false);
 x.disable();
});
