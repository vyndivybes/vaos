import test from 'node:test';import assert from 'node:assert/strict';
import {classifyDashboardQuestion,sanitizeVoiceTranscript,isDirectBusinessQuestion,voiceCapabilityReady,formatReadOnlyResult} from './main-voice.mjs';
test('voice bot is read-only and blocks operational write or approval commands',()=>{
 for(const s of ['approve PO 123','delete all records','transfer salary','pay supplier','dispatch an agent','post invoice','execute mission','create an order','update a customer'])
  assert.equal(classifyDashboardQuestion(s).kind,'DENY',s);
 assert.equal(classifyDashboardQuestion('what is our sales pipeline').kind,'INSIGHT');
 assert.equal(classifyDashboardQuestion('show engineering verification evidence').kind,'INSIGHT');
 assert.equal(classifyDashboardQuestion('What is the status of the programme?').kind,'INSIGHT');
 assert.equal(classifyDashboardQuestion('').kind,'DENY');
 assert.equal(classifyDashboardQuestion('Explain the VIBPE source code').kind,'EVIDENCE');
 assert.equal(classifyDashboardQuestion('What is our payroll readiness?').kind,'INSIGHT');
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
 assert.equal(formatReadOnlyResult('INSIGHT',{sourceSystem:'VYNDI_OS',status:'OBSERVED',answer:'1 job card',readOnly:true,actionAuthorized:false}).status,'OBSERVED');
 assert.throws(()=>formatReadOnlyResult('INSIGHT',{sourceSystem:'VYNDI_OS',status:'OBSERVED',answer:'fictitious data',actionAuthorized:true}));
});
test('main workspace voice region and ops navigation surfaces exist and use common UX skin',async()=>{
 const {readFile}=await import('node:fs/promises');
 const root=new URL('./',import.meta.url);
 const html=await readFile(new URL('workspace.html',root),'utf8');
 const css=await readFile(new URL('workspace-saas.css',root),'utf8');
 assert.match(html,/id="vaos-main-voice"/);
 assert.match(html,/id="vaos-voice-ask"/);
 assert.match(html,/id="vaos-voice-mic"/);
 assert.match(html,/id="vaos-wake-toggle"/);
 assert.match(html,/id="vaos-wake-indicator"/);
 assert.match(html,/id="vaos-wake-status"/);
 assert.match(html,/aria-pressed="false"/);
 assert.match(html,/main-voice\.mjs/);
 assert.match(css,/font-size:\s*(?:16px|1rem)/);
 for(const page of ['mission-status.html','agent-supervision.html','founder-console.html']){
  const source=await readFile(new URL(page,root),'utf8');
  assert.match(source,/operations-refresh\.css/);
  assert.match(source,/href="\/workspace"/);
 }
});

test('hands-free responds honestly to explicit unsupported questions rather than silently discarding them',()=>{
 assert.equal(isDirectBusinessQuestion('What is the status of VAOS?'),true);
 assert.equal(isDirectBusinessQuestion('How is the weather?'),true);
 assert.equal(isDirectBusinessQuestion('Please approve supplier payment'),false);
 assert.equal(isDirectBusinessQuestion('I spoke about production earlier'),false);
});

test('engineering voice uses VEDM + VIBPE instead of raw ERP counts',async()=>{
 const {readFile}=await import('node:fs/promises');
 const code=await readFile(new URL('./main-voice.mjs',import.meta.url),'utf8');
 assert.match(code,/intent\.domain==='engineering'/);
 assert.match(code,/\/api\/engineering-knowledge\?q=/);
 const result=formatReadOnlyResult('INSIGHT',{
  sourceSystem:'ENGINEERING_FEDERATION',status:'OBSERVED',readOnly:true,actionAuthorized:false,
  answer:'Controlled VEDM authority and VIBPE Co-Pilot method evidence retrieved.',
  sources:[{repository:'vayu-shastr/veloxis-engineering-design-manual',
   path:'CURRENT_CONFIGURATION_STATUS.md',sha:'a'.repeat(40),
   url:'https://github.com/vayu-shastr/veloxis-engineering-design-manual/blob/'+('a'.repeat(40))+'/CURRENT_CONFIGURATION_STATUS.md'}]});
 assert.equal(result.sources.length,1);
 assert.match(result.answer,/VIBPE Co-Pilot/);
});
