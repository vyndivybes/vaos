import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeDepartments,DEPARTMENT_EMPLOYEES} from '../apps/web/lib/business-department-summary.mjs';
test('all eight departments represented without inventing missing records',()=>{
 const out=summarizeDepartments([{employeeId:'finance',datedRecords:2,undatedCurrentRecords:1,groups:[],statusDistribution:[]}],DEPARTMENT_EMPLOYEES);
 assert.equal(out.length,8);assert.equal(out.find(x=>x.employeeId==='finance').datedRecords,2);
 assert.equal(out.find(x=>x.employeeId==='production').datedRecords,null);
 assert.equal(out.find(x=>x.employeeId==='production').state,'NOT_CONNECTED');
});
test('source truncation makes results partial instead of complete',()=>{
 const x=summarizeDepartments([{employeeId:'production',datedRecords:2,undatedCurrentRecords:0,groups:[{mayBeTruncated:true}],statusDistribution:[]}],DEPARTMENT_EMPLOYEES).find(x=>x.employeeId==='production');
 assert.equal(x.state,'PARTIAL');assert.equal(x.datedRecords,2);
});
test('reject invented revenue and invalid counts',()=>{
 assert.throws(()=>summarizeDepartments([{employeeId:'finance',datedRecords:-1,undatedCurrentRecords:0,groups:[]}]),/INVALID_DEPARTMENT_COUNTS/);
 assert.equal('revenue' in summarizeDepartments([])[0],false);
});
