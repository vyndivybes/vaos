import test from 'node:test';import assert from 'node:assert/strict';
import {classifyDashboardQuestion,sanitizeVoiceTranscript,voiceCapabilityReady,formatReadOnlyResult} from './main-voice.mjs';
test('voice bot is read-only and blocks operational write or approval commands',()=>{
 for(const s of ['approve PO 123','delete all records','transfer salary','pay supplier','dispatch an agent','post invoice','execute mission','create an order','update a customer'])
  assert.equal(classifyDashboardQuestion(s).kind,'DENY',s);
 assert.equal(classifyDashboardQuestion('what is our sales pipeline').kind,'COMMERCIAL');
 assert.equal(classifyDashboardQuestion('show engineering verification evidence').kind,'EVIDENCE');
 assert.equal(classifyDashboardQuestion('What is the status of the programme?').kind,'EVIDENCE');
 assert.equal(classifyDashboardQuestion('').kind,'DENY');
});
test('voice transcripts are bounded, do not execute by recognition alone',()=>{
 assert.equal(sanitizeVoiceTranscript('  Hey VAOS, what is the status?  '),'what is the status?');
 assert.equal(sanitizeVoiceTranscript('x'.repeat(500)),null);
 assert.equal(sanitizeVoiceTranscript(''),null);
});
test('voice permission respects founder read-only capability flag contract',()=>{
 assert.equal(voiceCapabilityReady({enabled:true,manualReviewRequired:true,actionAuthorized:false,agentDispatch:false,automaticSubmission:false,serverAudioEnabled:false}),true);
 assert.equal(voiceCapabilityReady({enabled:true,manualReviewRequired:false}),false);
 assert.equal(voiceCapabilityReady({enabled:false}),false);
});
test('no unaudited financial metrics are synthesized and malformed data fails closed',()=>{
 assert.match(formatReadOnlyResult('COMMERCIAL',{readOnly:true,actionAuthorized:false,sourceSystem:'VYNDI_OS',answer:'1 confirmed order'}).answer,/1 confirmed order/);
 assert.throws(()=>formatReadOnlyResult('COMMERCIAL',{answer:'fake revenue ₹100000'}));
 assert.throws(()=>formatReadOnlyResult('COMMERCIAL',{readOnly:true,actionAuthorized:true,sourceSystem:'VYNDI_OS',answer:'fake'}));
 assert.equal(formatReadOnlyResult('EVIDENCE',{answer:'not verified',sources:[]}).status,'HOLD');
});
test('main workspace voice region and ops navigation surfaces exist and use common UX skin',async()=>{
 const {readFile}=await import('node:fs/promises');
 const root=new URL('./',import.meta.url);
 const html=await readFile(new URL('workspace.html',root),'utf8');
 const css=await readFile(new URL('workspace-saas.css',root),'utf8');
 assert.match(html,/id="vaos-main-voice"/);
 assert.match(html,/id="vaos-voice-ask"/);
 assert.match(html,/id="vaos-voice-mic"/);
 assert.match(html,/main-voice\.mjs/);
 assert.match(css,/font-size:\s*(?:16px|1rem)/);
 for(const page of ['mission-status.html','agent-supervision.html','founder-console.html']){
  const source=await readFile(new URL(page,root),'utf8');
  assert.match(source,/operations-refresh\.css/);
  assert.match(source,/href="\/workspace"/);
 }
});
