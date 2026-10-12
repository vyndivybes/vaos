import test from 'node:test';import assert from 'node:assert/strict';
import {classifyDashboardQuestion,sanitizeVoiceTranscript,isDirectBusinessQuestion,voiceCapabilityReady,formatReadOnlyResult,splitDecisionBrief,formatAdaptiveStatus} from './main-voice.mjs';
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

test('founder requests business planning, scenario forecasting and comparisons through advisory route',async()=>{
 assert.equal(classifyDashboardQuestion('How should I improve our procurement plan?').kind,'ADVISORY');
 assert.equal(classifyDashboardQuestion('Forecast our customer demand next six months').kind,'ADVISORY');
 assert.equal(classifyDashboardQuestion('Compare bicycle market trends on the web').kind,'ADVISORY');
 assert.equal(classifyDashboardQuestion('Approve supplier payments after comparing').kind,'DENY');
 const response=formatReadOnlyResult('ADVISORY',{sourceSystem:'BUSINESS_ADVISORY',status:'OBSERVED',
  readOnly:true,actionAuthorized:false,advisoryOnly:true,language:'ta',translationQualified:true,
  answer:'Business analysis in Tamil. One option is to check available stock first.',
  webSources:[{title:'Bicycle sector coverage',url:'https://news.google.com/rss/articles/abc'}]});
 assert.equal(response.language,'ta');
 assert.equal(response.sources.length,1);
 assert.throws(()=>formatReadOnlyResult('ADVISORY',{sourceSystem:'BUSINESS_ADVISORY',
  status:'OBSERVED',readOnly:true,actionAuthorized:true,advisoryOnly:true,answer:'Fiction'}));
 const {readFile}=await import('node:fs/promises');
 const html=await readFile(new URL('./workspace.html',import.meta.url),'utf8');
 const code=await readFile(new URL('./main-voice.mjs',import.meta.url),'utf8');
 assert.match(html,/id="vaos-voice-language"/);
 assert.match(code,/api\/business-advisor\?q=/);
});

test('decision brief is short, card-safe and available as separate spoken executive summary',async()=>{
 const normalized=formatReadOnlyResult('ADVISORY',{sourceSystem:'BUSINESS_ADVISORY',
  status:'OBSERVED',readOnly:true,actionAuthorized:false,advisoryOnly:true,
  language:'en',translationQualified:true,
  answer:'Business review (read-only)\n\nDECISION — Reconcile shortages.\n\nKEY EVIDENCE — 47 shortage lines.\n\nDO FIRST — Rank affected job cards.',
  spokenAnswer:'First clear the most critical shortage lines before spending.',
  webSources:[]});
 assert.equal(normalized.spokenAnswer,'First clear the most critical shortage lines before spending.');
 const blocks=splitDecisionBrief(normalized.answer);
 assert.equal(blocks.length,4);
 assert.equal(blocks[1].label,'DECISION');
 assert.equal(blocks[2].detail,'47 shortage lines.');
 const {readFile}=await import('node:fs/promises');
 const html=await readFile(new URL('./workspace.html',import.meta.url),'utf8');
 const voice=await readFile(new URL('./main-voice.mjs',import.meta.url),'utf8');
 assert.ok(html.includes('/main-voice.mjs?v=20261013-adaptive-v2-upgradeprep'));
 assert.ok(voice.includes('player.speak(spokenAnswer||lastAnswer)'));
 assert.doesNotMatch(voice,/innerHTML\\s*=/);
});

test('adaptive intelligence is user-visible, read-only, and never trusts unverified technical links',async()=>{
 const {readFile}=await import('node:fs/promises');
 const html=await readFile(new URL('./workspace.html',import.meta.url),'utf8');
 const js=await readFile(new URL('./main-voice.mjs',import.meta.url),'utf8');
 assert.match(html,/id="vaos-voice-adaptive" type="checkbox" checked/);
 assert.match(html,/main-voice\.mjs\?v=20261013-adaptive-v2-upgradeprep/);
 assert.match(js,/\/api\/adaptive-intelligence\?q=/);
 const sha='a'.repeat(40);
 const safe='https://github.com/vayu-shastr/adv-vibpe/blob/'+sha+'/docs/KP.md';
 const normalized=formatReadOnlyResult('ADAPTIVE',{sourceSystem:'VAOS_ADAPTIVE',
  readOnly:true,advisoryOnly:true,actionAuthorized:false,status:'OBSERVED',
  answer:'ANALYSIS — Evidence is incomplete.\n\nRECOMMENDATION — Reconcile suppliers before committing materials.',
  spokenAnswer:'Evidence incomplete; reconcile supplier records before commitments.',
  sources:[{repository:'vayu-shastr/adv-vibpe',path:'docs/KP.md',url:safe},
   {repository:'evil/site',path:'private',url:'https://evil.invalid/attack'}]});
 assert.equal(normalized.sources.length,1);assert.equal(normalized.sources[0].url,safe);
 assert.equal(normalized.language,'en');
 assert.throws(()=>formatReadOnlyResult('ADAPTIVE',{sourceSystem:'VAOS_ADAPTIVE',readOnly:true,
  advisoryOnly:true,actionAuthorized:true,status:'OBSERVED',answer:'fake result fake result fake result'}));
});

test('unfamiliar cross-domain diagnosis is dispatched to adaptive advisory rather than single-domain keyword handling',()=>{
 const q='Why are our prototype delivery dates slipping because of suppliers, build readiness and cash flow?';
 assert.equal(classifyDashboardQuestion(q).kind,'ADVISORY');
 assert.equal(classifyDashboardQuestion('What is our payroll readiness?').kind,'INSIGHT');
 assert.equal(classifyDashboardQuestion('Approve and pay a supplier now').kind,'DENY');
});

test('upgrade prep: UI accurately labels model-check pass and daily budget fallback',()=>{
 const checked=formatAdaptiveStatus({reasoningMode:'MODEL_CHECKED_ADVISORY',
  verification:{status:'BOUNDED_CONSISTENCY_PASS'},sourceCoverage:{observed:2},
  diagnostics:{elapsedMs:2434,modelAvailability:'NONE'}});
 assert.match(checked,/model draft checked/i);
 assert.match(checked,/2 sources/);
 assert.match(checked,/2.4s/);
 const fallback=formatAdaptiveStatus({reasoningMode:'DETERMINISTIC_EVIDENCE',
  sourceCoverage:{observed:1},diagnostics:{modelAvailability:'BUDGET_EXHAUSTED'}});
 assert.match(fallback,/quota reached/i);
 assert.doesNotMatch(fallback,/model draft checked/i);
});
test('upgrade prep: UI never displays injected provider error in diagnostic status',()=>{
 const msg=formatAdaptiveStatus({reasoningMode:'MODEL_VERIFIED',
  sourceCoverage:{observed:10000},diagnostics:{elapsedMs:-1,modelAvailability:'token=private_key'}});
 assert.doesNotMatch(msg,/private_key|10000|\-1ms/);
 assert.match(msg,/No business changes/i);
});
