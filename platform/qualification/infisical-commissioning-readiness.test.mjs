import test from 'node:test';
import assert from 'node:assert/strict';
import { assessInfisicalCommissioning } from './infisical-commissioning-readiness.mjs';

const expected=[
  ['contract','automated',['manifest-v2','secret-resolver-suite','least-privilege-binding','secret-nondisclosure']],
  ['ephemeral-live','live',['universal-auth-login','allowed-secret-read','denied-scope-read','token-ttl-bounded']],
  ['staging','live',['credential-broker-integration','secret-value-nondisclosure','health-and-expiry','kill-switch']],
  ['production','live',['bootstrap-credential-rotation','rollback-drill']],
  ['production','manual',['owner-approval']]
];
const checks=expected.flatMap(([stage,evidenceClass,ids])=>ids.map(id=>({id,requiredEvidenceClass:evidenceClass,stage})));
const profile={providerId:'infisical',capability:'secret.broker',
  stages:['contract','ephemeral-live','staging','production'].map(stage=>({stage,checks:checks.filter(x=>x.stage===stage)}))};
const now='2026-10-08T16:00:00.000Z';
function snapshot(override={}){
  return {providerId:'infisical',enabled:false,qualification:{
    state:'qualified',qualifiedCapabilities:['secret.broker'],
    validUntil:'2026-11-07T16:00:00.000Z'
  },health:null,...override};
}
function evidence(){
  return checks.map((x,i)=>({providerId:'infisical',capability:'secret.broker',stage:x.stage,
    checkId:x.id,evidenceClass:x.requiredEvidenceClass,outcome:'pass',
    authorityRef:x.id==='owner-approval'
      ? 'https://github.com/vyndivybes/vaos/pull/46#issuecomment-6062907623'
      : 'github-actions:37786884419',
    recordedAt:'2026-10-08T15:45:00.000Z',
    evidenceRefs:['github-actions:evidence-'+i]}));
}
const assess=(s=snapshot(),e=evidence(),extra={})=>assessInfisicalCommissioning({
  snapshot:s,evidence:e,profile,now:new Date(now),...extra});

test('qualified, fully evidenced, disabled provider is SAFE_HOLD without fresh persisted health or activation approval',()=>{
  const result=assess();
  assert.equal(result.status,'SAFE_HOLD');
  assert.equal(result.qualified,true);
  assert.equal(result.enabled,false);
  assert.equal(result.passedChecks,15);
  assert.equal(result.expectedChecks,15);
  assert.equal(result.healthFresh,false);
  assert.equal(result.activationAuthorized,false);
  assert.equal(result.canActivate,false);
});

test('even a fresh healthy probe never authorizes routing on the preflight path',()=>{
  const s=snapshot({health:{status:'healthy',checkedAt:'2026-10-08T15:59:40.000Z',evidenceRef:'github-actions:run'}});
  const result=assess(s);
  assert.equal(result.healthFresh,true);
  assert.equal(result.status,'SAFE_HOLD');
  assert.equal(result.canActivate,false);
});

test('missing or failed qualification evidence fails closed',()=>{
  const incomplete=evidence().filter(x=>x.checkId!=='owner-approval');
  const missing=assess(snapshot(),incomplete);
  assert.equal(missing.status,'BLOCKED');
  assert.deepEqual(missing.missingChecks,['owner-approval']);
  assert.equal(assess(snapshot(),evidence().map(x=>x.checkId==='rollback-drill'?{...x,outcome:'fail'}:x)).status,'BLOCKED');
});

test('evidence stage or class mismatch cannot silently qualify provider',()=>{
  const invalid=evidence().map(x=>x.checkId==='owner-approval'?{...x,evidenceClass:'live'}:x);
  assert.equal(assess(snapshot(),invalid).status,'BLOCKED');
});

test('expired qualification is BLOCKED even with all 15 PASS checks',()=>{
  assert.equal(assess(snapshot({qualification:{state:'qualified',qualifiedCapabilities:['secret.broker'],validUntil:'2026-10-07T00:00:00.000Z'}})).status,'BLOCKED');
});

test('unexpected enabled state is ALERT and cannot be mistaken for authorized commissioning',()=>{
  const r=assess(snapshot({enabled:true}));
  assert.equal(r.status,'ALERT');
  assert.equal(r.canActivate,false);
});

test('missing or tampered provider state is BLOCKED and never calls activation',()=>{
  assert.equal(assess(null).status,'BLOCKED');
  assert.equal(assess(snapshot({providerId:'other'})).status,'BLOCKED');
});

test('stale or future-dated health is never counted as fresh',()=>{
  for(const checkedAt of ['2026-10-08T15:54:00.000Z','2026-10-08T16:01:00.000Z']){
    const r=assess(snapshot({health:{status:'healthy',checkedAt,evidenceRef:'health:canary'}}));
    assert.equal(r.healthFresh,false);
    assert.equal(r.canActivate,false);
  }
});
