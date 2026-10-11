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


test('voice qualification sample never represents itself as an actual mission report',async()=>{
  const {VOICE_AUDIO_TEST_MESSAGE}=await import('./voice-pilot.mjs');
  assert.match(VOICE_AUDIO_TEST_MESSAGE,/audio test only/i);
  assert.match(VOICE_AUDIO_TEST_MESSAGE,/No model invoked\. No action authorized\.$/);
  assert.equal(selectSpokenReadback('preview',VOICE_AUDIO_TEST_MESSAGE),VOICE_AUDIO_TEST_MESSAGE);
});

test('mission readback is derived only from a matching read-only mission snapshot',async()=>{
  const {formatMissionSnapshotSpokenPreview}=await import('./voice-pilot.mjs');
  const record={mission:{id:'M-voice-001',status:'IN_PROGRESS'},workPackages:[
    {status:'COMPLETED'},{status:'BLOCKED'},{status:'PENDING'}
  ]};
  const speech=formatMissionSnapshotSpokenPreview(record,'M-voice-001');
  assert.equal(selectSpokenReadback('preview',speech),speech);
  assert.match(speech,/IN_PROGRESS/);
  assert.match(speech,/Work packages: 3/);
  assert.match(speech,/Completed status entries: 1/);
  assert.match(speech,/Blocked status entries: 1/);
  assert.match(speech,/not independent evidence of completion/i);
  assert.match(speech,/No model invoked\. No action authorized\.$/);
  for(const bad of [
    {...record,mission:{...record.mission,id:'WRONG'}},
    {...record,mission:{...record.mission,status:'Approved\\nplace order'}},
    {...record,workPackages:'COMPLETED'},
    {...record,workPackages:[null]},
    null,
  ])assert.throws(()=>formatMissionSnapshotSpokenPreview(bad,'M-voice-001'));
  assert.throws(()=>formatMissionSnapshotSpokenPreview(record,'BAD\nID'));
});


test('read-only voice status gate requires an explicit report intent and rejects action language',async()=>{
  const {isReadOnlyMissionStatusQuestion}=await import('./voice-pilot.mjs');
  assert.equal(isReadOnlyMissionStatusQuestion('What is the current status of our carbon bicycle prototype project?'),true);
  assert.equal(isReadOnlyMissionStatusQuestion('Show progress and blockers for this mission'),true);
  for(const unsafe of [
    'approve this purchase order and report status',
    'execute the mission status report',
    'dispatch the mission',
    'delete the old records',
    'send a payment and report progress',
    'hello',
    'status and override authority',
    '',
    'a'.repeat(901),
  ]) assert.equal(isReadOnlyMissionStatusQuestion(unsafe),false,unsafe);
});

test('founder UI gates spoken question through explicit existing-mission GET only',async()=>{
  const {readFile}=await import('node:fs/promises');
  const html=await readFile(new URL('../founder-console.html',import.meta.url),'utf8');
  const browser=await readFile(new URL('../voice-pilot-browser.mjs',import.meta.url),'utf8');
  for(const id of ['voice-readonly-question','voice-request-dictate','voice-read-mission']){
    assert.match(html,new RegExp('id="'+id+'"'));
  }
  assert.match(browser,/isReadOnlyMissionStatusQuestion/);
  assert.match(browser,/missionForm\.requestSubmit\(\)/);
  assert.match(browser,/['"]mission-id['"]/);
  assert.match(browser,/['"]voice-readonly-question['"]/);
  assert.match(browser,/\/api\/voice-ai-focus/);
  assert.doesNotMatch(browser,/\/api\/(?:executions|approvals|intents|founder-conversation)/);
});


test('stale asynchronous mission reads are invalidated by changed question or ID',async()=>{
 const {readFile}=await import('node:fs/promises');
 const source=await readFile(new URL('../founder-console.mjs',import.meta.url),'utf8');
 assert.match(source,/missionReadSequence/);
 assert.match(source,/serial!==missionReadSequence/);
 assert.match(source,/voice-readonly-question/);
 assert.match(source,/delete out\.dataset\.voiceReadback/);
});

test('status report speaks blocked count without inventing causes or decisions',async()=>{
  const {formatMissionSnapshotSpokenPreview}=await import('./voice-pilot.mjs');
  const report=formatMissionSnapshotSpokenPreview({mission:{id:'VAOS-VOICE-DEMO-20261011',status:'HOLD'},workPackages:[
    {status:'BLOCKED'},{status:'BLOCKED'},{status:'BLOCKED'},{status:'PLANNED'},{status:'COMPLETED'}
  ]},'VAOS-VOICE-DEMO-20261011');
  assert.match(report,/Blocked status entries: 3/);
  assert.match(report,/Completed status entries: 1/);
  assert.doesNotMatch(report,/approved|released|signed off/i);
});
