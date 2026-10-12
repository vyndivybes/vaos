import test from 'node:test';import assert from 'node:assert/strict';
import {planAdaptiveReads,validateAdaptivePlan} from './adaptive-read-planner.mjs';
test('unfamiliar cross-functional operating question selects multiple authorized read domains',()=>{
 const p=planAdaptiveReads('Why are our prototype delivery dates slipping because of suppliers, build readiness and cash flow?');
 assert.deepEqual(p.domains,['finance','procurement','production','engineering']);
 assert.equal(p.actionAuthorized,false);assert.equal(p.maxReads,4);
 assert.equal(p.mode,'BOUNDED_READ_ONLY');
});
test('unrecognized request reports capability gap rather than using arbitrary tools',()=>{
 const p=planAdaptiveReads('Explain the origin of the Andromeda galaxy');
 assert.deepEqual(p.domains,[]);
 assert.equal(p.state,'UNSUPPORTED');
 assert.equal(p.actionAuthorized,false);
});
test('model plan may reorder only preapproved read domains and never supply tools or arguments',()=>{
 const p=validateAdaptivePlan({domains:['engineering','procurement'],mode:'read',reason:'Analyse release constraints'},
  {permitted:['engineering','procurement','finance']});
 assert.deepEqual(p.domains,['engineering','procurement']);
 assert.throws(()=>validateAdaptivePlan({domains:['production','secret-admin'],mode:'read',reason:'x'},{permitted:['production']}));
 assert.throws(()=>validateAdaptivePlan({domains:['finance'],mode:'write',reason:'x'},{permitted:['finance']}));
 assert.throws(()=>validateAdaptivePlan({domains:['finance'],mode:'read',reason:'x',endpoint:'https://evil.example'},{permitted:['finance']}));
});
test('sensitive and mutation requests never plan any reads as an execution substitute',()=>{
 for(const q of ['Approve the supplier purchase order', 'Transfer ₹5000 now','Delete the customer records'])
 assert.equal(planAdaptiveReads(q).state,'DENIED');
});
