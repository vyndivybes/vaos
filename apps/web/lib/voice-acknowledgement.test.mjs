import test from 'node:test';
import assert from 'node:assert/strict';
import {createVoiceAcknowledgement,voiceAcknowledgementText} from './voice-acknowledgement.mjs';

test('voice acknowledgement never claims a business task was completed',()=>{
 assert.match(voiceAcknowledgementText('SOURCE_REQUESTED'),/checking/i);
 assert.doesNotMatch(voiceAcknowledgementText('SOURCE_REQUESTED'),/completed|finished|updated|approved/i);
 assert.equal(voiceAcknowledgementText('COMPLETED'),'');
 assert.equal(voiceAcknowledgementText('HEARD'),'I heard your question.');
});

test('speech acknowledgement only uses opted-in output and tracks cancellation',()=>{
 const utterances=[],speaker={cancellations:0,speak:u=>utterances.push(u),cancel(){this.cancellations++;}};
 class Utterance{constructor(text){this.text=text;}}
 const ack=createVoiceAcknowledgement({synthesis:speaker,UtteranceClass:Utterance});
 assert.equal(ack.announce('SOURCE_REQUESTED',{enabled:false}),false);
 assert.equal(utterances.length,0);
 assert.equal(ack.announce('SOURCE_REQUESTED',{enabled:true}),true);
 assert.equal(utterances.length,1);
 assert.match(utterances[0].text,/checking/);
 ack.cancel();
 assert.equal(speaker.cancellations,1);
});

test('acknowledgement never interrupts a running answer or invents audible success',()=>{
 const utterances=[];
 const speaker={speak:u=>utterances.push(u),cancel(){}};
 const ack=createVoiceAcknowledgement({synthesis:speaker,UtteranceClass:class{constructor(text){this.text=text;}},
  outputBusy:()=>true});
 assert.equal(ack.announce('SOURCE_REQUESTED',{enabled:true}),false);
 assert.equal(utterances.length,0);
 assert.equal(ack.announce('COMPLETED',{enabled:true}),false);
});


test('Hey Jarvis produces a bounded truthful cue and signals microphone re-arm only after playback',()=>{
 const pending=[],said=[],finished=[],errors=[];
 const speaker={speak:u=>said.push(u),cancel(){}};
 class Utterance{constructor(text){this.text=text;}}
 const ack=createVoiceAcknowledgement({synthesis:speaker,UtteranceClass:Utterance,
  onFinished:(phase,status)=>finished.push([phase,status]),onError:code=>errors.push(code),
  schedule:(fn,ms)=>{const task={fn,ms,cancelled:false};pending.push(task);return task;},
  clear:task=>{task.cancelled=true;}});
 assert.equal(voiceAcknowledgementText('WAKE_READY'),'Yes, I am listening.');
 assert.equal(ack.announce('WAKE_READY',{enabled:false}),false);
 assert.equal(ack.announce('WAKE_READY',{enabled:true}),true);
 assert.equal(said.length,1);
 assert.equal(said[0].text,'Yes, I am listening.');
 assert.equal(finished.length,0);
 said[0].onstart();
 said[0].onend();
 assert.deepEqual(finished,[['WAKE_READY','SPEECH_FINISHED']]);
 assert.deepEqual(errors,[]);
 assert.ok(pending.every(t=>t.cancelled));
 assert.equal(ack.active(),false);
});

test('silently stalled wake playback exits safely rather than keeping the microphone paused',()=>{
 const tasks=[],finished=[],errors=[];
 const ack=createVoiceAcknowledgement({
  synthesis:{speak(){},cancel(){}},UtteranceClass:class{constructor(text){this.text=text;}},
  schedule:(fn,ms)=>{const t={fn,ms,cancelled:false};tasks.push(t);return t;},
  clear:t=>{t.cancelled=true;},
  onError:e=>errors.push(e),onFinished:(phase,status)=>finished.push([phase,status])
 });
 assert.equal(ack.announce('WAKE_READY',{enabled:true}),true);
 assert.equal(tasks[0].ms,3800);
 tasks[0].fn();
 assert.deepEqual(errors,['ACK_AUDIO_NOT_STARTED']);
 assert.deepEqual(finished,[['WAKE_READY','ACK_AUDIO_NOT_STARTED']]);
 assert.equal(ack.active(),false);
});
