import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  prepareVoiceTranscript,
  prepareSpeakableFounderDraft,
  createFounderVoiceController,
} from './founder-voice.mjs';

test('voice transcription is bounded and never interpreted as executable authority', () => {
  assert.equal(prepareVoiceTranscript('  What is the status of mission AB123?  '), 'What is the status of mission AB123?');
  for (const value of ['', 'x', 'a'.repeat(901), 'hello\nworld', null]) {
    assert.throws(() => prepareVoiceTranscript(value), /VOICE_TRANSCRIPT_INVALID/);
  }
});

test('spoken reply accepts only read-only unverified draft, never business effects', () => {
  const draft = {status:'AI_DRAFT_UNVERIFIED',content:'Work package is pending independent verification.',actionAuthorized:false};
  assert.match(prepareSpeakableFounderDraft(draft), /^Unverified AI draft\./);
  assert.match(prepareSpeakableFounderDraft(draft), /No business action authorized\.$/);
  for (const bad of [
    {...draft, status:'VERIFIED'},
    {...draft, actionAuthorized:true},
    {...draft, actionAuthorized:undefined},
    {...draft, content:'short'},
    {...draft, content:'A'.repeat(1201)},
    {...draft, content:'approved\r\nexecute'},
  ]) assert.throws(() => prepareSpeakableFounderDraft(bad), /VOICE_REPLY_NOT_READONLY/);
});

test('push-to-talk emits a transcript only; never submits an instruction or acts autonomously', () => {
  let active;
  const received=[];
  class FakeRecognition {
    start(){active=this;}
    stop(){this.onend?.();}
  }
  const voice=createFounderVoiceController({
    RecognitionClass:FakeRecognition,
    onTranscript:(value)=>received.push(value),
    onStatus:()=>{},
  });
  assert.equal(voice.dictationAvailable,true);
  assert.equal(voice.startDictation(),true);
  assert.equal(voice.startDictation(),false);
  active.onresult({results:[[{transcript:'Mission status report please'}]]});
  assert.deepEqual(received,['Mission status report please']);
  active.onend();
  assert.equal(voice.isListening(),false);
  assert.deepEqual(received,['Mission status report please']);
});

test('stopping dictation ignores any late transcription', () => {
  let active;
  const received=[];
  class FakeRecognition {
    start(){active=this;}
    stop(){}
  }
  const voice=createFounderVoiceController({
    RecognitionClass:FakeRecognition,onTranscript:(value)=>received.push(value),onStatus:()=>{},
  });
  voice.startDictation();
  voice.stopDictation();
  active.onresult({results:[[{transcript:'Late command must be ignored'}]]});
  assert.deepEqual(received,[]);
});

test('speech is user initiated and rejects non-read-only content', () => {
  let said='';let cancellations=0;
  class FakeUtterance {constructor(text){this.text=text;}}
  const voice=createFounderVoiceController({
    SpeechSynthesisUtteranceClass:FakeUtterance,
    synthesis:{speak:(u)=>{said=u.text;u.onstart?.();},cancel:()=>{cancellations++;}},
    onStatus:()=>{},
  });
  assert.equal(voice.speechAvailable,true);
  assert.equal(said,'');
  assert.equal(voice.speakDraft({status:'AI_DRAFT_UNVERIFIED',content:'Awaiting test approval from QA.',actionAuthorized:false}),true);
  assert.match(said,/Awaiting test approval/);
  voice.stopSpeaking();
  assert.ok(cancellations>=1);
  assert.equal(voice.speakDraft({status:'COMPLETED',content:'Execute immediately',actionAuthorized:true}),false);
});

test('unsupported browser gracefully disables voice controls', () => {
  const statuses=[];
  const voice=createFounderVoiceController({onStatus:(s)=>statuses.push(s)});
  assert.equal(voice.dictationAvailable,false);
  assert.equal(voice.speechAvailable,false);
  assert.equal(voice.startDictation(),false);
  assert.equal(voice.speakDraft({status:'AI_DRAFT_UNVERIFIED',content:'Status report available.',actionAuthorized:false}),false);
});

test('voice UI remains manual and never adds an autonomous submit control', async () => {
  const [page, script]=await Promise.all([
    readFile(new URL('./founder-console.html',import.meta.url),'utf8'),
    readFile(new URL('./founder-console.mjs',import.meta.url),'utf8'),
  ]);
  for (const id of ['voice-dictate','voice-stop','voice-speak','voice-silence','voice-status']) {
    assert.match(page,new RegExp('id="'+id+'"'));
  }
  assert.match(page,/not automatically submitted/i);
  assert.match(script,/prepareSpeakableFounderDraft|speakDraft/);
});
