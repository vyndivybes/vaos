import test from 'node:test';
import assert from 'node:assert/strict';
import { ingestInfisicalWave2Evidence, qualifyInfisicalIfReady } from './infisical-wave2-ingestion.mjs';

function bundle({production=false}={}){
  return {
    schemaVersion:'vaos.provider-live-evidence.v1',
    waveId:'provider-wave-2',
    providerId:'infisical',
    capability:'secret.broker',
    evidenceClass:'live',
    runtimeVersion:'universal-auth-v1+secrets-v4',
    source:{type:'github-actions',runId:production?'200':'100',runUrl:'https://github.com/vyndivybes/vaos/actions/runs/'+(production?'200':'100'),commitSha:'abcdef1234567'},
    createdAt:'2026-10-08T00:00:00.000Z',
    checks:(production
      ? ['bootstrap-credential-rotation','rollback-drill']
      : ['universal-auth-login','allowed-secret-read','denied-scope-read','token-ttl-bounded','credential-broker-integration','secret-value-nondisclosure','health-and-expiry','kill-switch']
    ).map(checkId=>({checkId,outcome:'pass',evidenceRef:'github-actions:'+(production?'200':'100')+':infisical:'+checkId})),
    productionActivation:false,
  };
}

test('ingestion records contract evidence plus live/staging/production evidence without activation',async()=>{
  const recorded=[];
  const engine={
    async recordEvidence(input){recorded.push(input)},
    assess(){return{providerId:'infisical',capability:'secret.broker',readyForQualification:false}},
  };
  const result=await ingestInfisicalWave2Evidence({engine,liveBundle:bundle(),productionBundle:bundle({production:true})});
  assert.equal(recorded.filter(x=>x.evidenceClass==='automated').length,4);
  assert.equal(recorded.filter(x=>x.evidenceClass==='live').length,10);
  assert.equal(recorded.some(x=>x.checkId==='owner-approval'),false);
  assert.equal(result.assessment.readyForQualification,false);
  assert.equal(JSON.stringify(recorded).includes('productionActivation'),false);
});

test('owner approval is recorded only when an explicit approval ref is supplied',async()=>{
  const recorded=[];
  const engine={
    async recordEvidence(input){recorded.push(input)},
    assess(){return{readyForQualification:true}},
  };
  await ingestInfisicalWave2Evidence({
    engine,liveBundle:bundle(),productionBundle:bundle({production:true}),
    ownerApprovalRef:'approval:infisical-owner-1',
  });
  const owner=recorded.find(x=>x.checkId==='owner-approval');
  assert.equal(owner.evidenceClass,'manual');
  assert.deepEqual(owner.evidenceRefs,['approval:infisical-owner-1']);
});

test('qualification happens only when assessment is ready and never activates provider',async()=>{
  let qualified=0;
  const engine={
    assess(){return{readyForQualification:true}},
    async qualify(input){qualified+=1;return{qualified:true,input}},
    async activate(){throw new Error('must not activate')},
  };
  const result=await qualifyInfisicalIfReady({engine,authorityRef:'approval:owner-1',reason:'Wave 2 complete'});
  assert.equal(result.qualified,true);
  assert.equal(qualified,1);
});

test('qualification refuses incomplete assessment',async()=>{
  const engine={assess(){return{readyForQualification:false}},async qualify(){throw new Error('must not qualify')}};
  await assert.rejects(()=>qualifyInfisicalIfReady({engine,authorityRef:'approval:1',reason:'x'}),/INFISICAL_WAVE2_QUALIFICATION_INCOMPLETE/);
});
