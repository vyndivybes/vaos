import test from 'node:test';
import assert from 'node:assert/strict';
import { createWindmillLiveDoQualificationHandler } from './windmill-live-do-qualification.mjs';
const runId='37860012345', runAttempt='1';
function res(){
  let code=200,body;
  return {setHeader(){return this;},status(n){code=n;return this;},
    json(v){body=v;return this;},get data(){return {code,body}}};
}
function input(phase='start'){
  return {method:'POST',headers:{authorization:'Bearer '+ 'x'.repeat(200)},
    body:{phase},env:{WINDMILL_ADMISSION:{
      getByName(name){
        assert.equal(name,'vaos-windmill-selftest-'+runId+'-'+runAttempt);
        return {
          startQualification:async()=>({status:'STARTED',admission:'PASS',productionActivation:false}),
          finishQualification:async()=>({status:'PASS',timeout:'QUARANTINED',productionActivation:false}),
          alarmStatus:async()=>({status:'ALARM_OBSERVED',alarmObserved:true,productionActivation:false,windmillCalls:0}),
        };
      },
    }}};
}
const valid=async()=>({runId,runAttempt});
test('separately signed GitHub identity routes only to isolated DO namespace',async()=>{
  const h=createWindmillLiveDoQualificationHandler({verifyIdentity:valid});
  for(const phase of ['start','status','finish']){
    const r=res();await h(input(phase),r);
    assert.equal(r.data.code,200);
    assert.equal(r.data.body.data.productionActivation,false);
  }
});
test('GET only exposes method-not-allowed presence for deploy readiness',async()=>{
  const r=res(),q=input();
  q.method='GET';delete q.headers.authorization;
  await createWindmillLiveDoQualificationHandler({verifyIdentity:valid})(q,r);
  assert.equal(r.data.code,405);
});
test('no identity, malformed bearer, wrong method or extra body fields denied',async()=>{
  const h=createWindmillLiveDoQualificationHandler({verifyIdentity:valid});
  for(const mut of [
    q=>delete q.headers.authorization,
    q=>q.headers.authorization='Bearer ',
    q=>q.body.phase='arbitrary',
    q=>q.body.extra='true',
  ]){
    const q=input(),r=res();mut(q);
    await h(q,r);
    assert.ok([401,422].includes(r.data.code));
  }
});
test('rejected OIDC and absent binding fail closed without qualification writes',async()=>{
  const h=createWindmillLiveDoQualificationHandler({verifyIdentity:async()=>{throw Error('bad identity')}});
  const a=res();await h(input(),a);assert.equal(a.data.code,401);
  const b=res(),q=input();q.env={};
  await createWindmillLiveDoQualificationHandler({verifyIdentity:valid})(q,b);
  assert.equal(b.data.code,503);
});
test('DO failure does not expose its error or any run ID',async()=>{
  const h=createWindmillLiveDoQualificationHandler({verifyIdentity:valid});
  const q=input(),r=res();q.env.WINDMILL_ADMISSION.getByName=()=>({
    startQualification:async()=>{throw Error('secret payload');},
  });
  await h(q,r);
  assert.equal(r.data.code,503);
  assert.doesNotMatch(JSON.stringify(r.data.body),/secret payload|37860012345/);
});

test('OIDC-authorized status poll is read-only and scoped to the identical isolated DO',async()=>{
  const h=createWindmillLiveDoQualificationHandler({verifyIdentity:valid});
  const q=input('status'),r=res();await h(q,r);
  assert.equal(r.data.code,200);
  assert.equal(r.data.body.data.alarmObserved,true);
  assert.equal(r.data.body.data.productionActivation,false);
});
