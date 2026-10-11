import test from 'node:test';
import assert from 'node:assert/strict';
import {appendVoiceTranscript, selectSpokenReadback, VOICE_PILOT_FLAG} from './voice-pilot.mjs';

test('voice pilot has a named, restricted commissioning flag',()=>{
  assert.equal(VOICE_PILOT_FLAG,'founder-readonly-browser-v1');
});
test('recognition adds text to a draft but never generates a submission',()=>{
  assert.equal(appendVoiceTranscript('Check status','of mission M-101',900),'Check status of mission M-101');
  assert.equal(appendVoiceTranscript('','Review the prototype BOM',900),'Review the prototype BOM');
});
test('oversized, control-character and blank transcripts fail closed',()=>{
  for(const t of ['', '  ', 'invalid\u0000input', 'x'.repeat(901)]){
    assert.throws(()=>appendVoiceTranscript('',t,900));
  }
  assert.throws(()=>appendVoiceTranscript('x'.repeat(895),'too long',900));
});
test('speech readback requires an authorized read-only display marker',()=>{
  const preview='READ-ONLY PREVIEW — NOT AN AI REPLY\nMission evidence\nNo model invoked. No action authorized.';
  assert.equal(selectSpokenReadback('preview',preview),preview);
  const draft='UNVERIFIED AI DRAFT — NOT AGENT EVIDENCE\nOne report\nNo business action authorized.';
  assert.equal(selectSpokenReadback('draft',draft),draft);
  for(const bad of ['Some successful execution','', 'Reading authoritative mission snapshot…']){
    assert.throws(()=>selectSpokenReadback('preview',bad));
  }
  assert.throws(()=>selectSpokenReadback('preview', 'READ-ONLY PREVIEW — NOT AN AI REPLY\nNo model invoked. No action authorized.\nFake successful execution'));
  assert.throws(()=>selectSpokenReadback('draft', 'UNVERIFIED AI DRAFT — NOT AGENT EVIDENCE\nNo business action authorized.\nExecute payment'));
  assert.throws(()=>selectSpokenReadback('unknown',preview));
  assert.throws(()=>selectSpokenReadback('preview',preview.repeat(100)));
});
