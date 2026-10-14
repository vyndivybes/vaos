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
