import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderQualificationEngine } from './provider-qualification-engine.mjs';

function profile(overrides={}) {
  return {
    schemaVersion:'vaos.provider-qualification-profile.v1',
    providerId:'playwright',
    capability:'browser.automate',
    validForDays:30,
    stages:[
      {stage:'contract',checks:[
        {id:'manifest-v2',requiredEvidenceClass:'automated'},
        {id:'adapter-suite',requiredEvidenceClass:'automated'},
      ]},
      {stage:'ephemeral-live',checks:[
        {id:'live-health',requiredEvidenceClass:'live'},
        {id:'happy-path',requiredEvidenceClass:'live'},
        {id:'failure-mode',requiredEvidenceClass:'live'},
      ]},
      {stage:'staging',checks:[
        {id:'staging-auth',requiredEvidenceClass:'live'},
        {id:'kill-switch',requiredEvidenceClass:'live'},
      ]},
      {stage:'production',checks:[
        {id:'rollback-drill',requiredEvidenceClass:'live'},
        {id:'owner-approval',requiredEvidenceClass:'manual'},
      ]},
    ],
    ...overrides,
  };
}
function makeControlPlane(){
  const calls=[];
  let snap={
    providerId:'playwright',
    enabled:false,
    capabilityEnabled:{'browser.automate':true},
    qualification:{state:'evaluation',qualifiedCapabilities:[],restrictedCapabilities:[],evidenceRefs:[],validUntil:null},
    routingRestrictions:{disabledDataClassifications:[],disabledRiskClasses:[]},
    health:{status:'healthy',checkedAt:'2026-10-08T00:00:00.000Z',evidenceRef:'health:1'},
  };
  return {
    calls,
    snapshot(){return structuredClone(snap)},
    async transitionQualification(input){
      calls.push(['qualify',input]);
      snap.qualification.state=input.to;
      if(input.to==='qualified'&&!snap.qualification.qualifiedCapabilities.includes(input.capability))snap.qualification.qualifiedCapabilities.push(input.capability);
      snap.qualification.evidenceRefs=[...new Set([...snap.qualification.evidenceRefs,...input.evidenceRefs])];
      snap.qualification.validUntil=input.validUntil??null;
      return structuredClone(snap);
    },
    async setProviderEnabled(input){calls.push(['provider',input]);snap.enabled=input.enabled;return structuredClone(snap)},
    async setCapabilityEnabled(input){calls.push(['capability',input]);snap.capabilityEnabled[input.capability]=input.enabled;return structuredClone(snap)},
  };
}

test('qualification assessment separates automated evidence from live evidence', async()=>{
  const cp=makeControlPlane();
  const engine=createProviderQualificationEngine({controlPlane:cp,profiles:[profile()],now:()=>new Date('2026-10-08T00:00:00.000Z')});
  for(const id of ['manifest-v2','adapter-suite']){
    await engine.recordEvidence({providerId:'playwright',capability:'browser.automate',checkId:id,outcome:'pass',evidenceClass:'automated',evidenceRefs:[`ci:${id}`],authorityRef:'ci:1'});
  }
  const assessment=engine.assess('playwright','browser.automate');
  assert.equal(assessment.stages.contract,'PASSED');
  assert.equal(assessment.stages['ephemeral-live'],'PENDING');
  assert.equal(assessment.readyForQualification,false);
});

test('live-required check cannot be satisfied by automated or manual evidence', async()=>{
  const engine=createProviderQualificationEngine({controlPlane:makeControlPlane(),profiles:[profile()]});
  await assert.rejects(()=>engine.recordEvidence({
    providerId:'playwright',capability:'browser.automate',checkId:'live-health',
    outcome:'pass',evidenceClass:'automated',evidenceRefs:['ci:not-live'],authorityRef:'ci:1',
  }),/PROVIDER_QUALIFICATION_EVIDENCE_CLASS_MISMATCH/);
});

test('failed evidence blocks stage even if an earlier pass exists', async()=>{
  const engine=createProviderQualificationEngine({controlPlane:makeControlPlane(),profiles:[profile()]});
  await engine.recordEvidence({providerId:'playwright',capability:'browser.automate',checkId:'manifest-v2',outcome:'pass',evidenceClass:'automated',evidenceRefs:['ci:pass'],authorityRef:'ci:1'});
  await engine.recordEvidence({providerId:'playwright',capability:'browser.automate',checkId:'manifest-v2',outcome:'fail',evidenceClass:'automated',evidenceRefs:['ci:regression'],authorityRef:'ci:2'});
  assert.equal(engine.assess('playwright','browser.automate').checks['manifest-v2'].status,'FAILED');
});

test('qualify fails closed until every required stage is passed', async()=>{
  const engine=createProviderQualificationEngine({controlPlane:makeControlPlane(),profiles:[profile()]});
  await assert.rejects(()=>engine.qualify({
    providerId:'playwright',capability:'browser.automate',authorityRef:'approval:1',reason:'premature',
  }),/PROVIDER_QUALIFICATION_INCOMPLETE/);
});

test('all staged evidence qualifies capability with aggregated evidence refs and validity', async()=>{
  const cp=makeControlPlane();
  const engine=createProviderQualificationEngine({controlPlane:cp,profiles:[profile()],now:()=>new Date('2026-10-08T00:00:00.000Z')});
  const evidence=[
    ['manifest-v2','automated'],['adapter-suite','automated'],
    ['live-health','live'],['happy-path','live'],['failure-mode','live'],
    ['staging-auth','live'],['kill-switch','live'],
    ['rollback-drill','live'],['owner-approval','manual'],
  ];
  for(const [id,evidenceClass] of evidence){
    await engine.recordEvidence({providerId:'playwright',capability:'browser.automate',checkId:id,outcome:'pass',evidenceClass,evidenceRefs:[`evidence:${id}`],authorityRef:'authority:test'});
  }
  const result=await engine.qualify({providerId:'playwright',capability:'browser.automate',authorityRef:'approval:qualify',reason:'all gates passed'});
  assert.equal(result.qualification.state,'qualified');
  assert.equal(result.qualification.qualifiedCapabilities.includes('browser.automate'),true);
  assert.equal(cp.calls[0][0],'qualify');
  assert.equal(cp.calls[0][1].evidenceRefs.length,9);
  assert.equal(cp.calls[0][1].validUntil,'2026-11-07T00:00:00.000Z');
});

test('activation requires qualified capability plus fresh healthy provider state', async()=>{
  const cp=makeControlPlane();
  const engine=createProviderQualificationEngine({controlPlane:cp,profiles:[profile()],now:()=>new Date('2026-10-08T00:00:10.000Z'),healthTtlMs:60_000});
  await assert.rejects(()=>engine.activate({providerId:'playwright',capability:'browser.automate',authorityRef:'approval:activate',reason:'not qualified'}),/PROVIDER_ACTIVATION_NOT_QUALIFIED/);

  cp.snapshot=()=>({
    providerId:'playwright',enabled:false,capabilityEnabled:{'browser.automate':true},
    qualification:{state:'qualified',qualifiedCapabilities:['browser.automate'],restrictedCapabilities:[],evidenceRefs:['q'],validUntil:'2026-11-07T00:00:00.000Z'},
    routingRestrictions:{disabledDataClassifications:[],disabledRiskClasses:[]},
    health:{status:'healthy',checkedAt:'2026-10-08T00:00:00.000Z',evidenceRef:'health:1'},
  });
  const activated=await engine.activate({providerId:'playwright',capability:'browser.automate',authorityRef:'approval:activate',reason:'controlled activation'});
  assert.equal(cp.calls.some(x=>x[0]==='provider'&&x[1].enabled===true),true);
  assert.equal(cp.calls.some(x=>x[0]==='capability'&&x[1].enabled===true),true);
  assert.equal(activated.activated,true);
});

test('activation fails when health is stale or unhealthy', async()=>{
  const cp=makeControlPlane();
  cp.snapshot=()=>({
    providerId:'playwright',enabled:false,capabilityEnabled:{'browser.automate':true},
    qualification:{state:'qualified',qualifiedCapabilities:['browser.automate'],restrictedCapabilities:[],evidenceRefs:['q'],validUntil:'2026-11-07T00:00:00.000Z'},
    routingRestrictions:{disabledDataClassifications:[],disabledRiskClasses:[]},
    health:{status:'healthy',checkedAt:'2026-10-07T23:00:00.000Z',evidenceRef:'health:old'},
  });
  const engine=createProviderQualificationEngine({controlPlane:cp,profiles:[profile()],now:()=>new Date('2026-10-08T00:00:00.000Z'),healthTtlMs:60_000});
  await assert.rejects(()=>engine.activate({providerId:'playwright',capability:'browser.automate',authorityRef:'approval:1',reason:'stale'}),/PROVIDER_ACTIVATION_HEALTH_INVALID/);
});

test('unknown checks and duplicate profiles are rejected', ()=>{
  assert.throws(()=>createProviderQualificationEngine({controlPlane:makeControlPlane(),profiles:[profile(),profile()]}),/PROVIDER_QUALIFICATION_PROFILE_DUPLICATE/);
  const engine=createProviderQualificationEngine({controlPlane:makeControlPlane(),profiles:[profile()]});
  assert.rejects(()=>engine.recordEvidence({providerId:'playwright',capability:'browser.automate',checkId:'unknown',outcome:'pass',evidenceClass:'automated',evidenceRefs:['x'],authorityRef:'a'}),/PROVIDER_QUALIFICATION_CHECK_NOT_FOUND/);
});
