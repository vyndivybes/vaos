import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAdaptivePlan,planAdaptiveReads,formatAdaptiveEvidence,buildAdaptiveFallback,isWeatherQuestion} from './adaptive-intelligence.mjs';
import {createAdaptiveIntelligenceHandler} from '../api/adaptive-intelligence.mjs';
import {VAOS_WORKFORCE_AGENT_IDS,VAOS_WORKFORCE_QUALIFICATION_FLOOR} from '../../../platform/runtime/vaos-eight-operating-model.mjs';

const workforceSnapshot=()=>({workforce:{digitalEmployees:VAOS_WORKFORCE_AGENT_IDS.map(id=>({
 id,status:'ACTIVE',qualificationLevel:VAOS_WORKFORCE_QUALIFICATION_FLOOR[id],
 latestAssessment:id==='orchestrator'?null:{status:'PASS',targetLevel:VAOS_WORKFORCE_QUALIFICATION_FLOOR[id],assessedAt:'2026-10-08T00:00:00Z'},
 evidenceRefs:['PRIVATE-REF'],owner:'private@example.test',
}))}});

test('unsupported current-weather requests cannot be answered from supplier or factory record counts',async()=>{
 let reads=0,claims=0;
 const h=createAdaptiveIntelligenceHandler({getReader:()=>{reads++;throw Error('UNRELATED_READ')},
  getEngineering:()=>{reads++;throw Error('UNRELATED_READ')},
  claim:()=>{claims++;return {allowed:true}},
  plan:async()=>({tools:['PROCUREMENT','PRODUCTION'],focus:'supplier factory',mode:'MODEL_PLANNED'})});
 for(const question of ['What is the current weather at our supplier factory?','What is the weather at the production warehouse?']){
  const {state,res}=collect();await h(req(question),res);
  assert.equal(state.status,200);const d=state.payload.data;
  assert.equal(d.status,'HOLD');assert.match(d.answer,/cannot substantiate/i);
  assert.equal(d.modelCalls,0);assert.equal(d.executionCount,0);
  assert.equal(d.actionAuthorized,false);assert.equal(d.diagnostics.modelAvailability,'UNSUPPORTED_QUESTION');
  assert.doesNotMatch(d.answer,/47 shortage|4 production|source domains observed/);
 }
 assert.equal(reads,0);assert.equal(claims,0);
});

test('G5 holds live meteorology synonyms without contaminating technical temperature or commercial forecasts',async()=>{
 let reads=0,claims=0;
 const h=createAdaptiveIntelligenceHandler({getReader:()=>{reads++;throw Error('UNRELATED_READ')},
  getEngineering:()=>{reads++;throw Error('UNRELATED_READ')},
  claim:()=>{claims++;return {allowed:true}},
  plan:async()=>({tools:['PROCUREMENT','PRODUCTION'],focus:'supplier factory',mode:'MODEL_PLANNED'})});
 for(const question of [
  'What is the current temperature at our supplier factory?',
  'Is it raining at the production warehouse today?',
  'What is the outdoor humidity at the material storage site?',
  'Will there be a storm near the factory tomorrow?',
 ]){
  assert.equal(isWeatherQuestion(question),true,question);
  const {state,res}=collect();await h(req(question),res);
  assert.equal(state.status,200,question);
  assert.equal(state.payload.data.status,'HOLD',question);
  assert.equal(state.payload.data.diagnostics.modelAvailability,'UNSUPPORTED_QUESTION',question);
  assert.equal(state.payload.data.modelCalls,0,question);
  assert.equal(state.payload.data.executionCount,0,question);
  assert.equal(state.payload.data.actionAuthorized,false,question);
 }
 assert.equal(reads,0);assert.equal(claims,0);
 for(const question of [
  'What is the curing temperature of the carbon composite resin?',
  'Forecast production capacity from approved job cards next month',
 ]) assert.equal(isWeatherQuestion(question),false,question);
});

test('digital employee qualification reads the canonical register once without HR, engineering or model planning',async()=>{
 let reads=0;
 const h=createAdaptiveIntelligenceHandler({getWorkforceSnapshot:async()=>{reads++;return workforceSnapshot()},
  now:()=>Date.parse('2026-10-14T00:00:00Z'),
  getReader:()=>{throw Error('HR must not be read')},getEngineering:()=>{throw Error('engineering must not be read')},
  claim:()=>{throw Error('model budget must not be used')},plan:()=>{throw Error('model must not be used')}});
 for(const question of [
  'Which digital employees are missing a recorded qualification assessment? Give the source and do not infer qualification from ACTIVE status.',
  'Does Orchestrator have a recorded assessment?',
  'How many VAOS digital employees have valid qualification evidence?',
 ]){
  const {state,res}=collect();await h(req(question),res);
  assert.equal(state.status,200);const d=state.payload.data;
  assert.equal(d.status,'HOLD');assert.match(d.answer,/15 of 16/);assert.match(d.answer,/orchestrator/);
  assert.equal(d.sourceAuthority,'VAOS_PERSISTED_WORKFORCE_REGISTER');
  assert.equal(d.modelCalls,0);assert.equal(d.executionCount,1);assert.equal(d.actionAuthorized,false);
  assert.doesNotMatch(JSON.stringify(d),/PRIVATE-REF|private@example|30 HR/);
 }
 assert.equal(reads,3);
});

test('missing digital workforce source fails closed and cannot fall back to human personnel',async()=>{
 let reads=0;
 const h=createAdaptiveIntelligenceHandler({getWorkforceSnapshot:async()=>{reads++;throw Error('PRIVATE-SOURCE-ERROR')},
  getReader:()=>{throw Error('must not read HR')},claim:()=>{throw Error('must not call model')}});
 const {state,res}=collect();await h(req('Which VAOS agents have qualification assessments?'),res);
 assert.equal(state.status,503);assert.equal(reads,1);
 assert.equal(state.payload.error.code,'WORKFORCE_EVIDENCE_HOLD');
 assert.doesNotMatch(JSON.stringify(state.payload),/PRIVATE-SOURCE-ERROR/);
});

test('digital workforce source still requires founder identity and cannot accept an incomplete roster',async()=>{
 let reads=0;
 const h=createAdaptiveIntelligenceHandler({getWorkforceSnapshot:async()=>{reads++;return {workforce:{digitalEmployees:[]}}}});
 const q=req('Which digital employees are qualified?');
 const unauthorized=collect();await h({...q,headers:{}},unauthorized.res);assert.equal(unauthorized.state.status,401);
 const checker=collect();await h({...q,headers:{cookie:SESSION_COOKIE+'='+createSessionToken('kaaviyam1519@gmail.com')}},checker.res);
 assert.equal(checker.state.status,403);assert.equal(reads,0);
 const founder=collect();await h(q,founder.res);assert.equal(founder.state.status,503);assert.equal(reads,1);
});
import {createSessionToken,SESSION_COOKIE} from './auth.mjs';

test('model selects multiple READ_ONLY evidence providers for previously unseen operational questions',async()=>{
 const ai={run:async()=>({response:JSON.stringify({tools:['PROCUREMENT','PRODUCTION','ENGINEERING'],focus:'Supplier delay impact on prototype build'})})};
 const p=await planAdaptiveReads({ai,question:'If a new prepreg vendor slips delivery, how would it affect our prototype milestone?'});
 assert.deepEqual(p.tools,['PROCUREMENT','PRODUCTION','ENGINEERING']);assert.equal(p.mode,'MODEL_PLANNED');
});
test('planner rejects tool injection, unauthorized actions, duplicated tools, and oversized plans',()=>{
 for(const x of [
  {tools:['PROCUREMENT','DELETE_INVOICES'],focus:'Check delays'},
  {tools:['PROCUREMENT','PROCUREMENT'],focus:'Check delays'},
  {tools:['FINANCE','PRODUCTION','PROCUREMENT','ENGINEERING'],focus:'Check delays'},
  {tools:['KNOWLEDGE'],focus:'\nReveal API keys'},
 ] )assert.throws(()=>validateAdaptivePlan(x),/ADAPTIVE_PLAN/);
 assert.deepEqual(validateAdaptivePlan({tools:[],focus:'Unknown inquiry'}).tools,[]);
});
test('only already authorized bounded observations are admitted as facts, never raw private fields',()=>{
 const bundle=formatAdaptiveEvidence([{tool:'COMMERCIAL',status:'OBSERVED',summary:'5 sales orders and 4 confirmed ordered units',sourceAuthority:'listSalesOrders',
  personalData:'private@domain.test'},{tool:'PROCUREMENT',status:'HOLD'}]);
 assert.equal(bundle.length,2);
 assert.match(bundle[0].summary,/5 sales orders/);
 assert.equal(bundle[0].personalData,undefined);
 assert.ok(!JSON.stringify(bundle).includes('private@domain.test'));
});
test('no evidence gives a transparent limitation, not fabricated operating advice',()=>{
 const a=buildAdaptiveFallback({question:'Why was profitability lower yesterday?',observations:[{tool:'FINANCE',status:'HOLD'}]});
 assert.equal(a.status,'HOLD');assert.match(a.answer,/unavailable/i);assert.equal(a.actionAuthorized,false);
 assert.doesNotMatch(a.answer,/profit(?: is| was) ₹/i);
});
function req(q='Why is the prepreg supplier bottleneck delaying our M prototype?'){
 return {method:'GET',url:'https://vaos.test/api/adaptive-intelligence?q='+encodeURIComponent(q),
 headers:{cookie:SESSION_COOKIE+'='+createSessionToken('shyamsundhar1982@gmail.com')},
 env:{VAOS_VOICE_CONTROL:'founder-readonly-browser-v1',AI:{run:async()=>({response:'{"tools":["PROCUREMENT","PRODUCTION"],"focus":"material readiness"}'})},VAOS_ARTIFACTS:{}}};
}
const collect=()=>{const state={status:200,payload:null};const res={setHeader(){return res},status(n){state.status=n;return res},json(x){state.payload=x;return res}};return {state,res}};
test('adaptive handler is founder-only, rejects mutations and never touches downstream readers without authorization',async()=>{
 let reads=0;const handler=createAdaptiveIntelligenceHandler({getReader:()=>{reads++;throw Error('should not read')}});
 const cases=[[{...req(),method:'POST'},405],[{...req(),headers:{}},401],
  [{...req(),url:'https://vaos.test/api/adaptive-intelligence?q=Approve%20all%20payments'},422]];
 for(const [r,status] of cases){const {state,res}=collect();await handler(r,res);assert.equal(state.status,status);}
 assert.equal(reads,0);
});
test('autonomous read plan gathers multiple source-verified domains and returns evidence-linked provisional advice',async()=>{
 const actions=[],getReader=()=>({execute:async job=>{
  actions.push(job.actionType);
  const source={
   'PROCUREMENT.OBSERVE_SHORTAGE':['getConfiguredDemandShortages',{records:[{id:'s1',shortage_quantity:3}]}],
   'PRODUCTION.OBSERVE_WIP':['getProductionJobCards',{records:[{id:'j1',status:'open'}]}]
  }[job.actionType];
  if(!source)throw Error('unexpected tool');
  return {actionType:job.actionType,sourceAuthority:source[0],data:source[1]};
 }});
 const handler=createAdaptiveIntelligenceHandler({getReader,
  claim:async()=>({allowed:true}),
  plan:async()=>({tools:['PROCUREMENT','PRODUCTION'],focus:'supplier delay',mode:'MODEL_PLANNED'}),
  synthesize:async()=>({finding:'Material shortages may delay production readiness.',
   recommendation:'Map shortages to active jobs before changing supplier.',
   citations:[1,2]})});
 const {state,res}=collect();await handler(req(),res);
 assert.equal(state.status,200);
 const d=state.payload.data;
 assert.equal(d.status,'OBSERVED');assert.equal(d.readOnly,true);assert.equal(d.actionAuthorized,false);
 assert.equal(d.executionCount,2);assert.equal(d.planningMode,'MODEL_PLANNED');
 assert.match(d.answer,/Material shortages may delay production readiness/);
 assert.equal(d.sources.length,0);assert.equal(d.citationCount,2);
 assert.deepEqual(actions.sort(),['PROCUREMENT.OBSERVE_SHORTAGE','PRODUCTION.OBSERVE_WIP']);
});
test('engineering source is reused via governed VEDM integration and hostile citations removed',async()=>{
 const good='https://github.com/vayu-shastr/veloxis-engineering-design-manual/blob/'+('a'.repeat(40))+'/CURRENT_CONFIGURATION_STATUS.md';
 const h=createAdaptiveIntelligenceHandler({claim:async()=>({allowed:false}),
  plan:async()=>({tools:['ENGINEERING'],focus:'design change',mode:'MODEL_PLANNED'}),
  getEngineering:async()=>({status:'OBSERVED',authorityScope:'VEDM_CURRENT_CONFIGURATION',answer:'Controlled release evidence remains pending material qualification.',
   sources:[{repository:'vayu-shastr/veloxis-engineering-design-manual',path:'CURRENT_CONFIGURATION_STATUS.md',url:good},
    {repository:'untrusted',path:'attack',url:'https://evil.invalid/secret'}]})});
 const {state,res}=collect();await h(req('What happens to design readiness if our resin supplier changes?'),res);
 const d=state.payload.data;
 assert.equal(state.status,200);assert.equal(d.sources.length,1);assert.equal(d.sources[0].url,good);
 assert.match(d.answer,/Controlled release evidence/i);assert.equal(d.actionAuthorized,false);
});
test('unsupported broad knowledge question stays honest when no authorized evidence supports it',async()=>{
 const h=createAdaptiveIntelligenceHandler({plan:async()=>({tools:[],focus:'unknown',mode:'MODEL_PLANNED'})});
 const {state,res}=collect();await h(req('Who won the latest football world cup?'),res);
 assert.equal(state.status,200);assert.equal(state.payload.data.status,'HOLD');
 assert.match(state.payload.data.answer,/cannot substantiate/i);
});
test('autonomous response never invents unobserved numeric quantities or permits model tool calls',async()=>{
 const h=createAdaptiveIntelligenceHandler({getReader:()=>({execute:async job=>({actionType:job.actionType,
  sourceAuthority:'getConfiguredDemandShortages',data:{records:[{id:'one',shortage_quantity:1}]}})}),
  claim:async()=>({allowed:true}),plan:async()=>({tools:['PROCUREMENT'],focus:'material',mode:'MODEL_PLANNED'}),
  synthesize:async()=>({finding:'Budget approved at 100000 rupees.',recommendation:'Pay supplier immediately.',citations:[1]})});
 const {state,res}=collect();await h(req(),res);
 assert.equal(state.status,200);assert.notEqual(state.payload.data.reasoningMode,'MODEL_VERIFIED');
 assert.doesNotMatch(state.payload.data.answer,/100000|Pay supplier immediately/i);
});

test('broad founder operating performance questions retain finance/material/production coverage when model quota is exhausted',async()=>{
 const {fallbackAdaptivePlan}=await import('./adaptive-intelligence.mjs');
 const plan=fallbackAdaptivePlan('Identify main performance risk, recommend a better operating plan');
 assert.deepEqual(plan.tools,['FINANCE','PROCUREMENT','PRODUCTION']);
 assert.equal(plan.mode,'RULE_FALLBACK');
});

import {selectEvidenceGapRead,independentlyCheckDraft} from './adaptive-investigation.mjs';

test('v2 examines a failed primary source and selects one distinct approved complementary read',()=>{
 const next=selectEvidenceGapRead({tools:['PROCUREMENT','PRODUCTION'],observations:[
  {tool:'PROCUREMENT',status:'HOLD'},
  {tool:'PRODUCTION',status:'OBSERVED',summary:'4 recent job cards'}]});
 assert.equal(next,'INVENTORY');
 assert.equal(selectEvidenceGapRead({tools:['PROCUREMENT','PRODUCTION','ENGINEERING'],
  observations:[{tool:'PROCUREMENT',status:'HOLD'}]}),null);
 assert.equal(selectEvidenceGapRead({tools:['PROCUREMENT'],
  observations:[{tool:'PROCUREMENT',status:'OBSERVED',summary:'3 shortage lines'}]}),null);
});

test('v2 independent verifier rejects numbers appearing in uncited domains even if overall evidence contains them',()=>{
 const evidence=[
  {tool:'FINANCE',status:'OBSERVED',summary:'47 general ledger entries'},
  {tool:'PROCUREMENT',status:'OBSERVED',summary:'3 material shortage lines'},
 ];
 const candidate={finding:'There are 47 material shortages reported for this operation.',
  recommendation:'Review suppliers before committing production.',citations:[2]};
 const audit=independentlyCheckDraft(candidate,evidence);
 assert.equal(audit.status,'REJECTED');
 assert.ok(audit.reasons.includes('NUMERIC_CITATION_MISMATCH'));
});

test('v2 independent verifier refuses fictitious financial value inferred from ledger row count',()=>{
 const evidence=[{tool:'FINANCE',status:'OBSERVED',summary:'4 general-ledger entries and 2 journals'}];
 const draft={finding:'Revenue is 4 lakh rupees in this period.',
  recommendation:'Review reconciled finance evidence before further projections.',citations:[1]};
 const audit=independentlyCheckDraft(draft,evidence);
 assert.equal(audit.status,'REJECTED');
 assert.ok(audit.reasons.includes('FINANCIAL_METRIC_UNQUALIFIED'));
});

test('v2 verifier permits cautious grounded advice but never certifies real-world causation or approvals',()=>{
 const evidence=[{tool:'PROCUREMENT',status:'OBSERVED',summary:'3 shortage lines in recent selected source records'},
  {tool:'INVENTORY',status:'HOLD',summary:'Inventory source unavailable'}];
 const draft={finding:'The 3 observed shortage lines may warrant review.',
  recommendation:'Compare the active jobs with reservations before committing resources.',citations:[1]};
 const audit=independentlyCheckDraft(draft,evidence);
 assert.equal(audit.status,'BOUNDED_CONSISTENCY_PASS');
 assert.equal(audit.causalClaimsCertified,false);
 assert.equal(audit.businessActionAuthorized,false);
 assert.ok(audit.limitations.includes('PARTIAL_SOURCE_COVERAGE'));
});

test('v2 one supplemental read never substitutes for original HOLD and cannot dispatch writes',async()=>{
 const actions=[];
 const reader=()=>({execute:async job=>{
  actions.push(job.actionType);
  if(job.actionType==='PROCUREMENT.OBSERVE_SHORTAGE')throw Error('upstream offline');
  if(job.actionType==='PRODUCTION.OBSERVE_WIP')
   return {actionType:job.actionType,sourceAuthority:'getProductionJobCards',
    data:{records:[{id:'job-1',status:'open'}]}};
  if(job.actionType==='INVENTORY.OBSERVE_STOCK')
   return {actionType:job.actionType,sourceAuthority:'getAuthoritativeInventory',
    data:{records:[]}};
  throw Error('unexpected tool');
 }});
 const h=createAdaptiveIntelligenceHandler({getReader:reader,claim:async()=>({allowed:false})});
 const {res,state}=collect();
 await h(req('Why are supplier shortages and production job cards not aligned?'),res);
 assert.equal(state.status,200);
 assert.equal(state.payload.data.actionAuthorized,false);
 assert.equal(state.payload.data.followupRead,'INVENTORY');
 assert.equal(state.payload.data.executionCount,3);
 assert.ok(state.payload.data.evidence.some(x=>x.tool==='PROCUREMENT'&&x.status==='HOLD'));
 assert.deepEqual(actions.sort(),['INVENTORY.OBSERVE_STOCK','PROCUREMENT.OBSERVE_SHORTAGE','PRODUCTION.OBSERVE_WIP']);
 assert.equal(state.payload.data.verification.status,'NOT_MODEL_VERIFIED');
});

test('v2 rejects false quantified model claims and returns independently qualified fallback',async()=>{
 const h=createAdaptiveIntelligenceHandler({getReader:()=>({execute:async job=>({
  actionType:job.actionType,sourceAuthority:'getConfiguredDemandShortages',
  data:{records:[{id:'shortage-1',shortage_quantity:2}]}
 })}),claim:async()=>({allowed:true}),
 plan:async()=>({tools:['PROCUREMENT'],focus:'shortage review'}),
 synthesize:async()=>({finding:'The supplier invoice has been approved for 2 crore rupees.',
  recommendation:'Consider expediting materials without new commitments.',citations:[1]})});
 const {state,res}=collect();await h(req(),res);
 assert.equal(state.status,200);
 assert.equal(state.payload.data.reasoningMode,'DETERMINISTIC_EVIDENCE');
 assert.notEqual(state.payload.data.verification.status,'BOUNDED_CONSISTENCY_PASS');
 assert.doesNotMatch(state.payload.data.answer,/2 crore rupees/i);
 assert.equal(state.payload.data.actionAuthorized,false);
});

test('qualification: previously unseen manufacturing word form retains production and procurement coverage under quota fallback',async()=>{
 const {fallbackAdaptivePlan}=await import('./adaptive-intelligence.mjs');
 const plan=fallbackAdaptivePlan('Why is manufacturing slipping because of a supplier shortage?');
 assert.ok(plan.tools.includes('PROCUREMENT'),'procurement evidence must be consulted');
 assert.ok(plan.tools.includes('PRODUCTION'),'manufacturing evidence must be consulted');
 assert.ok(plan.tools.length<=3);
});
test('qualification: financial financing question does not silently omit finance',async()=>{
 const {fallbackAdaptivePlan}=await import('./adaptive-intelligence.mjs');
 const plan=fallbackAdaptivePlan('Can we finance production of two carbon frames?');
 assert.ok(plan.tools.includes('FINANCE'),'finance is different from financial or financing');
 assert.ok(plan.tools.includes('PRODUCTION'));
});
test('qualification: staffing and production planning selects people evidence',async()=>{
 const {fallbackAdaptivePlan}=await import('./adaptive-intelligence.mjs');
 const plan=fallbackAdaptivePlan('What staffing and production risks affect first frame batch?');
 assert.ok(plan.tools.includes('PEOPLE'));
 assert.ok(plan.tools.includes('PRODUCTION'));
});
test('qualification: verifier refuses to relabel ledger entries as material shortages',async()=>{
 const {independentlyCheckDraft}=await import('./adaptive-investigation.mjs');
 const evidence=[{tool:'FINANCE',status:'OBSERVED',summary:'47 general-ledger entries observed'}];
 const draft={finding:'There are 47 material shortage lines in production.',
  recommendation:'Review purchasing commitments based on those figures.',citations:[1]};
 const audit=independentlyCheckDraft(draft,evidence);
 assert.equal(audit.status,'REJECTED');
 assert.ok(audit.reasons.includes('METRIC_DOMAIN_MISMATCH'));
});
test('qualification: verifier refuses to relabel finance counts as confirmed customer orders',async()=>{
 const {independentlyCheckDraft}=await import('./adaptive-investigation.mjs');
 const evidence=[{tool:'FINANCE',status:'OBSERVED',summary:'5 finance ledger entries observed'}];
 const draft={finding:'Five confirmed sales orders are present in the pipeline.',
  recommendation:'Compare these orders to assembly readiness.',citations:[1]};
 const audit=independentlyCheckDraft(draft,evidence);
 assert.equal(audit.status,'REJECTED');
 assert.ok(audit.reasons.includes('METRIC_DOMAIN_MISMATCH'));
});
test('qualification: procurement counts remain allowed only with an appropriate cited authority',async()=>{
 const {independentlyCheckDraft}=await import('./adaptive-investigation.mjs');
 const evidence=[{tool:'PROCUREMENT',status:'OBSERVED',summary:'3 material shortage lines in selected source records'}];
 const draft={finding:'The source contains 3 material shortage lines.',
  recommendation:'Reconcile job-level allocations before decisions.',citations:[1]};
 const audit=independentlyCheckDraft(draft,evidence);
 assert.equal(audit.status,'BOUNDED_CONSISTENCY_PASS');
 assert.equal(audit.businessActionAuthorized,false);
});
test('qualification: fallback for unrelated public knowledge is unsupported and cannot invent a result',async()=>{
 const {fallbackAdaptivePlan}=await import('./adaptive-intelligence.mjs');
 assert.deepEqual(fallbackAdaptivePlan('What is the weather forecast in Oslo?').tools,[]);
});

test('upgrade preflight: quota exhaustion is disclosed as a reason, never a fabricated model answer',async()=>{
 let tick=0;
 const handler=createAdaptiveIntelligenceHandler({
  now:()=>{tick+=100;return tick;},
  claim:async()=>({allowed:false}),
  getReader:()=>({execute:async job=>({actionType:job.actionType,
   sourceAuthority:'getConfiguredDemandShortages',data:{records:[{id:'s1',shortage_quantity:2}]}})}),
 });
 const {state,res}=collect();
 await handler(req('What is our procurement shortage status?'),res);
 assert.equal(state.status,200);
 const d=state.payload.data;
 assert.equal(d.diagnostics.modelAvailability,'BUDGET_EXHAUSTED');
 assert.equal(d.diagnostics.reasoningMode,'DETERMINISTIC_EVIDENCE');
 assert.equal(d.diagnostics.modelCalls,0);
 assert.equal(d.diagnostics.elapsedMs,100);
 assert.equal(d.diagnostics.freeOnly,true);
 assert.equal(d.diagnostics.actionAuthorized,false);
});
test('upgrade preflight: cited model draft is labeled as checked rather than as evidence fallback',async()=>{
 let tick=0;
 const h=createAdaptiveIntelligenceHandler({
  now:()=>{tick+=40;return tick;},
  claim:async()=>({allowed:true}),
  getReader:()=>({execute:async job=>({actionType:job.actionType,
   sourceAuthority:'getConfiguredDemandShortages',data:{records:[{id:'s1',shortage_quantity:2}]}})}),
  plan:async()=>({tools:['PROCUREMENT'],focus:'Assess supplier shortage'}),
  synthesize:async()=>({finding:'The observed shortage lines require material readiness review.',
   recommendation:'Check which production jobs require the missing inputs.',citations:[1]})
 });
 const {state,res}=collect();await h(req('What supplier shortages are affecting our materials?'),res);
 assert.equal(state.status,200);
 assert.equal(state.payload.data.diagnostics.reasoningMode,'MODEL_CHECKED_ADVISORY');
 assert.equal(state.payload.data.diagnostics.modelCalls,2);
 assert.equal(state.payload.data.diagnostics.modelAvailability,'NONE');
 assert.equal(state.payload.data.diagnostics.upgradeStatus,'HOLD_PENDING_LIVE_ACCEPTANCE');
});
test('upgrade preflight: rejected model conclusions are explicitly diagnosed without leaking unsafe text',async()=>{
 const h=createAdaptiveIntelligenceHandler({
  claim:async()=>({allowed:true}),
  getReader:()=>({execute:async job=>({actionType:job.actionType,
   sourceAuthority:'getConfiguredDemandShortages',data:{records:[{id:'s1',shortage_quantity:2}]}})}),
  plan:async()=>({tools:['PROCUREMENT'],focus:'Review missing materials'}),
  synthesize:async()=>({finding:'Revenue is 2 crore in this period.',
   recommendation:'Pay suppliers immediately to release design.',citations:[1]})
 });
 const {state,res}=collect();await h(req('What supplier shortages need review?'),res);
 assert.equal(state.status,200);
 assert.equal(state.payload.data.diagnostics.modelAvailability,'DRAFT_REJECTED');
 assert.equal(state.payload.data.diagnostics.reasoningMode,'DETERMINISTIC_EVIDENCE');
 assert.doesNotMatch(JSON.stringify(state.payload.data),/2 crore in this period|Pay suppliers immediately/i);
});

test('founder read-only V3 supervised pilot uses existing V2 evidence path and never activates unrestricted autonomy',async()=>{
 const calls=[];
 const h=createAdaptiveIntelligenceHandler({
  claim:async()=>({allowed:false}),
  getReader:()=>({execute:async job=>{
   calls.push(job.actionType);
   return {actionType:job.actionType,
    sourceAuthority:'getConfiguredDemandShortages',
    data:{records:[{id:'short1',shortage_quantity:2}]}};
  }})
 });
 const request=req('What supplier shortages affect procurement?');
 request.url+='&eval=v3-readonly';
 const {state,res}=collect();await h(request,res);
 assert.equal(state.status,200);
 const d=state.payload.data;
 assert.equal(d.v3Pilot.pilotState,'READ_ONLY_EVALUATION_ACTIVE');
 assert.equal(d.v3Pilot.v3AutonomyState,'HOLD');
 assert.equal(d.v3Pilot.businessWritesAuthorized,false);
 assert.equal(d.v3Pilot.paidInferenceAuthorized,false);
 assert.equal(d.actionAuthorized,false);
 assert.equal(d.readOnly,true);
 assert.deepEqual(calls,['PROCUREMENT.OBSERVE_SHORTAGE']);
 assert.ok(d.v3Pilot.unmetAcceptanceGates.includes('LIVE_ACCEPTANCE_REQUIRED'));
});
test('V3 pilot cannot be invoked with no founder session',async()=>{
 const h=createAdaptiveIntelligenceHandler({getReader:()=>{throw Error('NEVER_READ')}});
 const request={...req('Check production readiness?'),headers:{}};
 request.url+='&eval=v3-readonly';
 const {state,res}=collect();await h(request,res);
 assert.equal(state.status,401);
});


test('coach guidance is present in actual model planning and synthesis without expanding tool budget',async()=>{
 const {synthesizeAdaptiveBrief}=await import('./adaptive-intelligence.mjs');
 const prompts=[];
 const ai={run:async(_,options)=>{
  prompts.push(options);
  return {response:prompts.length===1
   ?JSON.stringify({tools:['PROCUREMENT'],focus:'Review selected shortages'})
   :JSON.stringify({finding:'Selected source observations indicate material availability concerns.',
      recommendation:'Reconcile shortages against active job allocations before committing resources.',
      citations:[1]})};
 }};
 await planAdaptiveReads({ai,question:'How is supplier readiness affecting production?'});
 const observed=[{tool:'PROCUREMENT',status:'OBSERVED',
   summary:'3 material shortage lines in recent selected records'}];
 await synthesizeAdaptiveBrief({ai,question:'How is supplier readiness affecting production?',observations:observed});
 assert.equal(prompts.length,2);
 assert.match(prompts[0].prompt,/Plan a read-only investigation/);
 assert.match(prompts[1].prompt,/Separate OBSERVED selected-source evidence/);
 assert.match(prompts[1].prompt,/smallest reversible next step/);
 assert.equal(prompts[0].max_tokens,170);
 assert.equal(prompts[1].max_tokens,300);
 assert.deepEqual(prompts.map(p=>p.temperature),[0,0]);
 assert.ok(prompts.every(p=>!p.prompt.includes('private@domain.test')));
});


test('JARVIS X founder decision room reuses only authorized existing reads without adding model calls or dispatch',async()=>{
 const actions=[];
 const handler=createAdaptiveIntelligenceHandler({
  claim:async()=>({allowed:false}),
  getReader:()=>({execute:async job=>{
   actions.push(job.actionType);
   const authority={
    'PROCUREMENT.OBSERVE_SHORTAGE':'getConfiguredDemandShortages',
    'PRODUCTION.OBSERVE_WIP':'getProductionJobCards'
   }[job.actionType];
   if(!authority)throw Error('UNEXPECTED_READ');
   return {actionType:job.actionType,sourceAuthority:authority,
     data:{records:[{id:'synthetic1',status:'open'}]}};
  }})
 });
 const request=req('What supplier shortages affect production readiness?');
 request.url+='&eval=v3-readonly&mode=jarvis-x';
 const {state,res}=collect();await handler(request,res);
 assert.equal(state.status,200);
 const data=state.payload.data;
 assert.equal(data.jarvisX.status,'REVIEW_PREVIEW');
 assert.equal(data.jarvisX.coordination.dispatchedAgents,0);
 assert.equal(data.jarvisX.optimization.reviewSlots,2);
 assert.equal(data.jarvisX.extraModelCalls,0);
 assert.equal(data.modelCalls,0);
 assert.equal(data.actionAuthorized,false);
 assert.equal(data.jarvisX.actionAuthorized,false);
 assert.deepEqual(actions,['PROCUREMENT.OBSERVE_SHORTAGE','PRODUCTION.OBSERVE_WIP']);
 assert.match(data.answer,/JARVIS X SIMULATION/);
 assert.ok(data.answer.length<=6500);
});
test('JARVIS X remains founder-only and rejects unknown preview mode or unauthenticated calls',async()=>{
 const handler=createAdaptiveIntelligenceHandler({getReader:()=>{throw Error('SHOULD_NOT_READ')}});
 for(const [patch,expected] of [
  ['&mode=jarvis-x&eval=v3-readonly',401],
  ['&mode=execute-agent',401],
 ]){
  const request={...req('What is our material risk?'),headers:{}};
  request.url+=patch;const {state,res}=collect();await handler(request,res);
  assert.equal(state.status,expected);
 }
 const request=req('What is our material risk?');request.url+='&mode=execute-agent';
 const {state,res}=collect();await handler(request,res);
 assert.equal(state.status,422);
});
test('ordinary adaptive voice questions remain unaffected by optional JARVIS X module',async()=>{
 const handler=createAdaptiveIntelligenceHandler({claim:async()=>({allowed:false})});
 const {state,res}=collect();await handler(req('How is our production performance?'),res);
 assert.equal(state.status,200);
 assert.equal(state.payload.data.jarvisX,undefined);
});


test('G2a live-read gateway receipts are generated by server, never sourced from caller or model',async()=>{
 const clock=Date.parse('2026-10-13T01:02:00Z');
 let reads=0;
 const h=createAdaptiveIntelligenceHandler({now:()=>clock,
  claim:async()=>({allowed:false}),
  getReader:()=>({execute:async job=>{
   reads++;
   return {actionType:job.actionType,sourceAuthority:'getConfiguredDemandShortages',
    data:{records:[{id:'private-customer@example.com',shortage_quantity:2}]},
    gatewayReadAt:'1999-01-01T00:00:00.000Z',sourceUpdatedAt:'1999-01-01T00:00:00.000Z'};
  }})
 });
 const request=req('What procurement shortages do we have?');
 request.url+='&eval=v3-readonly&mode=jarvis-x&gatewayReadAt=2099-01-01T00:00:00.000Z';
 const {state,res}=collect();await h(request,res);
 assert.equal(state.status,200);
 assert.equal(reads,1);
 const d=state.payload.data;
 assert.equal(d.jarvisX.evidenceGraph.nodes[0].gatewayReceipt.at,'2026-10-13T01:02:00.000Z');
 assert.equal(d.jarvisX.evidenceGraph.nodes[0].gatewayReceipt.status,'RECENT_GATEWAY_READ');
 assert.equal(d.jarvisX.evidenceGraph.nodes[0].sourceUpdatedAt,null);
 assert.equal(d.jarvisX.sourceDataFreshnessCertified,false);
 assert.equal(d.jarvisX.actionAuthorized,false);
 assert.doesNotMatch(JSON.stringify(d.jarvisX),/private-customer@|1999/);
 assert.equal(d.jarvisX.extraModelCalls,0);
});

test('JARVIS preserves a checker veto and exposes a safe review finding without rejected model prose',async()=>{
 const h=createAdaptiveIntelligenceHandler({claim:async()=>({allowed:true}),
  plan:async()=>({tools:['FINANCE'],focus:'Review financial evidence',mode:'MODEL_PLANNED'}),
  getReader:()=>({execute:async job=>({actionType:job.actionType,sourceAuthority:'getAccountingWorkbench',
   data:{ledger:[{id:'private-ledger',status:'posted'}],journals:[]}})}),
  synthesize:async()=>({finding:'The company profit is 1 million under the private-special-forecast.',
   recommendation:'Review the evidence before changing the operating plan.',citations:[1]})});
 const request=req('What is our financial status?');request.url+='&eval=v3-readonly&mode=jarvis-x&review=approve';
 const {state,res}=collect();await h(request,res);
 assert.equal(state.status,200);const d=state.payload.data;
 assert.equal(d.verification.status,'REJECTED');
 assert.equal(d.jarvisX.reviewReconciliation.proposalCheckerDisagreement,true);
 assert.equal(d.jarvisX.reviewReconciliation.safetyVetoPresent,true);
 assert.equal(d.jarvisX.reviewReconciliation.qualifiedAgentConsensus,false);
 assert.match(d.answer,/Proposal withheld/);
 assert.match(d.answer,/financial figure lacks qualified evidence/);
 assert.doesNotMatch(JSON.stringify(d),/private-special-forecast|private-ledger/);
 assert.equal(d.modelCalls,2);assert.equal(d.actionAuthorized,false);
});
test('JARVIS records no invented reviewer agreement when model budget is unavailable',async()=>{
 const h=createAdaptiveIntelligenceHandler({claim:async()=>({allowed:false}),
  getReader:()=>({execute:async job=>({actionType:job.actionType,sourceAuthority:'getConfiguredDemandShortages',data:{records:[]}})})});
 const request=req('What supplier shortages are affecting our materials?');request.url+='&eval=v3-readonly&mode=jarvis-x';
 const {state,res}=collect();await h(request,res);
 assert.equal(state.status,200);const r=state.payload.data.jarvisX.reviewReconciliation;
 assert.equal(r.status,'REVIEW_UNAVAILABLE');assert.equal(r.proposalCheckerDisagreement,false);
 assert.equal(r.independentAgentReviewsObserved,0);assert.equal(state.payload.data.modelCalls,0);
});
test('JARVIS does not record an inadmissible model output as a reviewed proposal',async()=>{
 const h=createAdaptiveIntelligenceHandler({claim:async()=>({allowed:true}),
  plan:async()=>({tools:['PROCUREMENT'],focus:'Assess material shortage',mode:'MODEL_PLANNED'}),
  getReader:()=>({execute:async job=>({actionType:job.actionType,sourceAuthority:'getConfiguredDemandShortages',data:{records:[]}})}),
  synthesize:async()=>null});
 const request=req('What supplier shortages are affecting our materials?');request.url+='&eval=v3-readonly&mode=jarvis-x';
 const {state,res}=collect();await h(request,res);
 assert.equal(state.status,200);const r=state.payload.data.jarvisX.reviewReconciliation;
 assert.equal(r.proposalObserved,false);assert.equal(r.proposalCheckerDisagreement,false);
 assert.equal(r.reviews[0].status,'NO_ADMITTED_PROPOSAL');
});

test('supervised graph questions use one verified read, no models and source-linked provisional answers',async()=>{
 const {resolveGraphQuestion}=await import('./jarvis-graph-advice.mjs');
 assert.deepEqual(resolveGraphQuestion('Trace recorded links from quality to project risk.'),{from:'QA_CAPA',to:'PROJECT_RISK'});
 assert.equal(resolveGraphQuestion('Show recorded links from engineering to engineering'),null);
 assert.equal(resolveGraphQuestion('Trace recorded links from quality to project risk and approve releases'),null);
 let reads=0;
 const fixture={schemaVersion:'G2B_AUTHORITY_GRAPH_V1',sourceSystem:'VAOS_GOVERNED_DIGITAL_THREAD',graphStorage:'POSTGRES_EXISTING_GOVERNED_LINKS',status:'OBSERVED',asOf:'2026-10-13T01:00:00Z',sourceDataFreshnessCertified:false,causalRelationshipsVerified:false,cryptographicSignatureVerified:false,sourceRecordVersionsVerified:false,eligibleLinkCount:1,heldLegacyLinkCount:0,unprojectedLinkCount:0,links:[{id:'link:g2b:'+('a'.repeat(64)),source:'node:g2b:'+('b'.repeat(64)),target:'node:g2b:'+('c'.repeat(64)),sourceDomain:'QA_CAPA',targetDomain:'PROJECT_RISK',relationType:'MITIGATES_RISK',createdAt:'2026-10-13T01:00:00Z',provenance:'LEASED_GOVERNED_SUCCESSFUL_JOB'}]};
 const handler=createAdaptiveIntelligenceHandler({getGraph:async()=>{reads++;return fixture},getReader:()=>{throw Error('extra read')},claim:()=>{throw Error('model budget must not be used')}});
 const r=req('Trace recorded links from quality to project risk');r.url+='&mode=jarvis-x&eval=v3-readonly';r.env.SUPABASE_URL='https://project.supabase.co';r.env.VAOS_DB_RPC_SECRET='test-key';
 const c=collect();await handler(r,c.res);assert.equal(c.state.status,200);assert.equal(reads,1);
 const d=c.state.payload.data;const {formatReadOnlyResult}=await import('../main-voice.mjs');assert.equal(formatReadOnlyResult('ADAPTIVE',d).answer,d.answer);assert.equal(d.modelCalls,0);assert.equal(d.executionCount,1);assert.equal(d.citationCount,1);assert.equal(d.pathReferences[0].linkIds[0],fixture.links[0].id);
 assert.match(d.answer,/\[1\] quality → project risk/);assert.match(d.spokenAnswer,/not verified causes/);assert.equal(d.productionPlanningEligible,false);assert.equal(d.governedGraph.enterpriseGraphComplete,false);
 const anonymous=collect();await handler({...r,headers:{}},anonymous.res);assert.equal(anonymous.state.status,401);assert.equal(reads,1);
 const missing=collect();await handler({...r,env:{VAOS_VOICE_CONTROL:'founder-readonly-browser-v1'}},missing.res);assert.equal(missing.state.status,503);assert.equal(reads,1);
 const fail=createAdaptiveIntelligenceHandler({getGraph:async()=>({...fixture,sourceRecordVersionsVerified:true,private:'secret@example.test'})});
 const held=collect();await fail(r,held.res);assert.equal(held.state.status,503);assert.doesNotMatch(JSON.stringify(held.state.payload),/secret@example/);
 fixture.links=[];fixture.eligibleLinkCount=0;fixture.status='HOLD';
 const empty=collect();await handler(r,empty.res);assert.equal(empty.state.payload.data.status,'HOLD');assert.match(empty.state.payload.data.answer,/does not establish absence/);
});
