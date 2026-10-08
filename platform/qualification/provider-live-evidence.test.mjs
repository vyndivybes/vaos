import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProviderLiveEvidence, ingestProviderLiveEvidence } from './provider-live-evidence.mjs';

function bundle(overrides={}){
  return {
    schemaVersion:'vaos.provider-live-evidence.v1',
    waveId:'provider-wave-1',
    providerId:'playwright',
    capability:'browser.automate',
    evidenceClass:'live',
    runtimeVersion:'1.64.0',
    source:{
      type:'github-actions',
      runId:'37749639638',
      runUrl:'https://github.com/vyndivybes/vaos/actions/runs/37749639638',
      commitSha:'748d8230f25b9834c55cd600b488e54cf1b17460',
    },
    createdAt:'2026-10-08T08:30:00.000Z',
    checks:[
      {checkId:'live-health',outcome:'pass',evidenceRef:'github-actions:37749639638:playwright:live-health'},
      {checkId:'happy-path',outcome:'pass',evidenceRef:'github-actions:37749639638:playwright:happy-path'},
      {checkId:'failure-mode',outcome:'pass',evidenceRef:'github-actions:37749639638:playwright:failure-mode'},
    ],
    productionActivation:false,
    ...overrides,
  };
}

test('valid live evidence bundle is normalized and immutable',()=>{
  const result=validateProviderLiveEvidence(bundle());
  assert.equal(result.providerId,'playwright');
  assert.equal(result.evidenceClass,'live');
  assert.equal(result.checks.length,3);
  assert.equal(Object.isFrozen(result),true);
});

test('CI evidence cannot claim production activation',()=>{
  assert.throws(()=>validateProviderLiveEvidence(bundle({productionActivation:true})),/PROVIDER_LIVE_EVIDENCE_ACTIVATION_FORBIDDEN/);
});

test('source must be a concrete GitHub Actions run tied to a commit SHA',()=>{
  assert.throws(()=>validateProviderLiveEvidence(bundle({source:{type:'github-actions',runId:'',runUrl:'x',commitSha:'y'}})),/PROVIDER_LIVE_EVIDENCE_INVALID:source/);
  assert.throws(()=>validateProviderLiveEvidence(bundle({source:{type:'manual',runId:'1',runUrl:'https://example.test',commitSha:'abc'}})),/PROVIDER_LIVE_EVIDENCE_INVALID:source/);
});

test('duplicate check IDs and malformed evidence refs are rejected',()=>{
  const b=bundle();
  b.checks.push({...b.checks[0]});
  assert.throws(()=>validateProviderLiveEvidence(b),/PROVIDER_LIVE_EVIDENCE_INVALID:duplicateCheck/);

  const c=bundle();
  c.checks[0].evidenceRef='not-a-run-evidence-ref';
  assert.throws(()=>validateProviderLiveEvidence(c),/PROVIDER_LIVE_EVIDENCE_INVALID:evidenceRef/);
});

test('ingestion records each live check into the staged qualification engine only',async()=>{
  const recorded=[];
  const engine={
    async recordEvidence(input){recorded.push(input);return input},
  };
  const result=await ingestProviderLiveEvidence({
    engine,
    bundle:bundle(),
    authorityRef:'github-actions:37749639638',
  });
  assert.equal(result.recordedChecks,3);
  assert.equal(recorded.every(x=>x.evidenceClass==='live'),true);
  assert.equal(recorded[0].providerId,'playwright');
  assert.equal(recorded[0].capability,'browser.automate');
  assert.equal(recorded.some(x=>'enabled' in x),false);
});

test('failed live checks are preserved as failed evidence instead of being discarded',async()=>{
  const b=bundle();
  b.checks[1].outcome='fail';
  const recorded=[];
  await ingestProviderLiveEvidence({engine:{async recordEvidence(x){recorded.push(x)}},bundle:b,authorityRef:'github-actions:run'});
  assert.equal(recorded.find(x=>x.checkId==='happy-path').outcome,'fail');
});
