import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateEmployeeEvidencePriorities} from './workforce-evidence-priorities.mjs';
test('never imply an employee is qualified when independent reviewer evidence is missing',()=>{
 const x=evaluateEmployeeEvidencePriorities({employees:[{id:'agent1',audit:{status:'UNVERIFIED_NO_REVIEW_LEDGER'},reports:{status:'NOT_RECORDED'},forecast:{status:'NOT_QUALIFIED'}}]});
 assert.equal(x[0].status,'HOLD');assert.ok(x[0].missing.includes('INDEPENDENT_AUDIT'));
 assert.ok(x[0].missing.includes('FORECAST_EVIDENCE'));
});
test('missing employees have explicit record hold rather than invented activity',()=>{
 const x=evaluateEmployeeEvidencePriorities({employees:[{id:'agent1'}]});
 assert.equal(x[0].status,'HOLD');assert.ok(x[0].missing.includes('AUDIT_RECORD'));
 assert.equal(x[0].authorizedToWrite,false);
});
test('reject unsafe or repeated employee evidence IDs',()=>{
 assert.throws(()=>evaluateEmployeeEvidencePriorities({employees:[{id:'a'},{id:'a'}]}),/DUPLICATE/);
 assert.throws(()=>evaluateEmployeeEvidencePriorities({employees:[{id:'a',audit:{status:'PASS'}}],actionAuthorized:true}),/READ_ONLY/);
});