import test from 'node:test';
import assert from 'node:assert/strict';
import {createWindmillCancellationController} from './cancellation-controller.mjs';
const job='019effff-aaaa-7bbb-8ccc-0123456789ab';
const script='f/vaos/qualification_hold';
const running={id:job,script_path:script,running:true,canceled:false,script_hash:'92dd4d9b9bff2d1d'};
const terminal={id:job,script_path:script,canceled:true,success:false,script_hash:'92dd4d9b9bff2d1d'};
const req={providerRunId:job,scriptPath:script,authorizationRef:'qualification:operator-approved',token:'cancel-test',readToken:'read-test'};
function fixture(readbacks=[running,terminal],cancelError=false){
 const calls=[]; let i=0;
 return {calls,async request(q){calls.push(q);if(q.method==='POST'){if(cancelError)throw Error('timeout');return {status:202};}return {status:200,body:readbacks[Math.min(i++,readbacks.length-1)]};}};
}
test('proves running with separate GET before exactly one non-force cancellation POST and terminal GET',async()=>{
 const t=fixture();let permit=false;
 const x=await createWindmillCancellationController({httpTransport:t,maxPolls:2,sleep:async()=>{},beforeCancel:async()=>{permit=true;}}).cancelAndVerify(req);
 assert.equal(permit,true);assert.deepEqual(t.calls.map(c=>c.method),['GET','POST','GET']);
 assert.equal(x.runningBeforeCancellation,true);assert.equal(x.cancelPostAttemptCount,1);assert.equal(x.status,'CANCELLED_VERIFIED');
 assert.ok(t.calls[1].url.includes('/queue/cancel/'));assert.ok(!t.calls[1].url.includes('force'));
 assert.equal(t.calls[0].headers.Authorization,'Bearer read-test');assert.equal(t.calls[1].headers.Authorization,'Bearer cancel-test');
 assert.doesNotMatch(JSON.stringify(x),/cancel-test|read-test/);
});
test('queued or already terminal job never receives a cancellation POST',async()=>{
 for(const body of [{...running,running:false},terminal,{...running,success:true}]){
  const t=fixture([body]);await assert.rejects(createWindmillCancellationController({httpTransport:t,maxPolls:1,sleep:async()=>{}}).cancelAndVerify(req));
  assert.equal(t.calls.filter(c=>c.method==='POST').length,0);
 }
});
test('wrong job, wrong script and ping refuse cancellation before mutation',async()=>{
 for(const body of [{...running,id:'wrong'},{...running,script_path:'other'}]){const t=fixture([body]);await assert.rejects(createWindmillCancellationController({httpTransport:t,maxPolls:1}).cancelAndVerify(req));assert.equal(t.calls.length,1);}
 const t=fixture();await assert.rejects(createWindmillCancellationController({httpTransport:t}).cancelAndVerify({...req,scriptPath:'f/vaos/qualification_ping'}));assert.equal(t.calls.length,0);
});
test('a failed durable permission callback never sends cancellation POST',async()=>{
 const t=fixture();await assert.rejects(createWindmillCancellationController({httpTransport:t,beforeCancel:async()=>{throw Error('fence rejected');}}).cancelAndVerify(req));assert.equal(t.calls.length,1);
});
test('unknown cancellation outcome preserves quarantine and never retries POST',async()=>{
 const t=fixture([running],true);await assert.rejects(createWindmillCancellationController({httpTransport:t}).cancelAndVerify(req),{code:'WINDMILL_CANCEL_OUTCOME_UNKNOWN'});assert.equal(t.calls.filter(c=>c.method==='POST').length,1);
});
test('acknowledgement without terminal evidence never reports success',async()=>{
 const t=fixture([running]);await assert.rejects(createWindmillCancellationController({httpTransport:t,maxPolls:1}).cancelAndVerify(req),{code:'WINDMILL_CANCEL_NOT_TERMINAL'});
});
