import test from 'node:test';
import assert from 'node:assert/strict';
import { createWindmillCancellationController } from './cancellation-controller.mjs';

const job='019effff-aaaa-7bbb-8ccc-0123456789ab';
const script='f/vaos/qualification_ping';
const req={providerRunId:job,scriptPath:script,authorizationRef:'qualification:operator-approved'};
function transport({cancelStatus=202,readbacks=[{status:200,body:{id:job,script_path:script,canceled:true,success:false}}]}={}){
  const calls=[];let reads=0;
  return {calls,async request(input){
    calls.push(input);
    if(input.method==='POST')return {status:cancelStatus,body:{}};
    return readbacks[Math.min(reads++,readbacks.length-1)];
  }};
}
test('cancels only approved Windmill job and proves terminal cancellation by GET readback',async()=>{
  const t=transport();
  const c=createWindmillCancellationController({httpTransport:t});
  const result=await c.cancelAndVerify({...req,token:'test-cancel-token',readToken:'test-read-token'});
  assert.equal(result.status,'CANCELLED_VERIFIED');
  assert.equal(result.providerRunId,job);
  assert.equal(t.calls.length,2);
  assert.equal(t.calls[0].method,'POST');
  assert.equal(t.calls[1].method,'GET');
  assert.doesNotMatch(JSON.stringify(result),/test-cancel-token|test-read-token/);
});
test('never cancels unapproved script or unapproved authority',async()=>{
  const t=transport();const c=createWindmillCancellationController({httpTransport:t});
  await assert.rejects(c.cancelAndVerify({...req,scriptPath:'f/vaos/engineering_mass_estimate',token:'x',readToken:'y'}));
  await assert.rejects(c.cancelAndVerify({...req,authorizationRef:'none',token:'x',readToken:'y'}));
  assert.equal(t.calls.length,0);
});
test('cancellation POST does not authorize release until confirmed canceled',async()=>{
  const t=transport({readbacks:[{status:200,body:{id:job,script_path:script,canceled:false,success:false}}]});
  await assert.rejects(createWindmillCancellationController({httpTransport:t,maxPolls:1}).cancelAndVerify({...req,token:'x',readToken:'y'}));
});
test('request timeouts never retry cancellation POST',async()=>{
  let posts=0;
  const c=createWindmillCancellationController({httpTransport:{async request({method}){if(method==='POST'){posts++;throw new Error('network timeout');}return {};}}});
  await assert.rejects(c.cancelAndVerify({...req,token:'x',readToken:'y'}));
  assert.equal(posts,1);
});
test('readback mismatched job or changed script cannot be treated as cancellation',async()=>{
  for(const changed of [{id:'changed'},{script_path:'other'}]){
    const t=transport({readbacks:[{status:200,body:{id:job,script_path:script,canceled:true,...changed}}]});
    await assert.rejects(createWindmillCancellationController({httpTransport:t,maxPolls:1}).cancelAndVerify({...req,token:'x',readToken:'y'}));
  }
});
