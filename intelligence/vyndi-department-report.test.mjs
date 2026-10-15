import test from 'node:test';
import assert from 'node:assert/strict';
import {DEPARTMENT_READS,sourceDate,buildDepartmentSourceReport} from './vyndi-department-report.mjs';
const asOf='2026-10-15T09:00:00Z';
const supply=(data,authority='listSalesOrders',actionType='COMMERCIAL.OBSERVE_PIPELINE')=>({
 actionType,sourceAuthority:authority,data
});
test('all eight commissioned business sources map to distinct authorised employee actions',()=>{
 assert.equal(Object.keys(DEPARTMENT_READS).length,8);
 assert.equal(new Set(Object.values(DEPARTMENT_READS).map(x=>x.action)).size,8);
});
test('period changes show dated records but retain undated snapshots distinctly',()=>{
 const r=buildDepartmentSourceReport({employeeId:'commercial',from:'2026-10-01',to:'2026-10-15',observedAt:asOf,source:supply({records:[
  {id:'NEW',status:'lead',updated_at:'2026-10-13T08:00:00Z',unit:3},
  {id:'OLD',status:'closed',updated_at:'2026-09-01T08:00:00Z'},
  {id:'SNAP',status:'current'},
  {id:'SECRET',secret_token:'never-expose',amount:42,updated_at:'2026-10-12T09:00:00Z'}
 ]})});
 assert.equal(r.datedRecords,2);
 assert.equal(r.undatedCurrentRecords,1);
 assert.equal(r.records.length,3);
 assert.equal(r.completePeriod,false);
 assert.equal(r.coverage,'BOUNDED_SIGNED_SOURCE_SAMPLE');
 assert.equal(r.statusDistribution.find(x=>x.label==='lead').count,1);
 assert.ok(!JSON.stringify(r).includes('never-expose'));
 assert.match(r.notes[1],/not exhaustive/);
});
test('rejects forged source authority, malformed date and incomplete source shape',()=>{
 assert.throws(()=>buildDepartmentSourceReport({employeeId:'finance',source:supply({ledger:[],journals:[]}),from:'2026-10-01',to:'2026-10-15'}),/AUTHORITY/);
 assert.throws(()=>buildDepartmentSourceReport({employeeId:'commercial',source:supply({records:[]}),from:'bad',to:'2026-10-15'}),/PERIOD/);
 assert.throws(()=>buildDepartmentSourceReport({employeeId:'production',source:supply({},'getProductionJobCards','PRODUCTION.OBSERVE_WIP'),from:'2026-10-01',to:'2026-10-15'}),/SOURCE_SHAPE/);
});
test('inventory snapshot with no date is not misrepresented as historical work',()=>{
 const r=buildDepartmentSourceReport({employeeId:'inventory',from:'2026-10-01',to:'2026-10-15',source:supply({records:[{sku:'A',physical_quantity:12,available_to_promise:10}]},'getAuthoritativeInventory','INVENTORY.OBSERVE_STOCK')});
 assert.equal(r.datedRecords,0);assert.equal(r.undatedCurrentRecords,1);
 assert.equal(r.statusDistribution.length,0);
 assert.equal(r.forecast.status,'NOT_QUALIFIED');
 assert.equal(sourceDate({updated_at:'2026-10-09T07:00:00Z'}),'2026-10-09');
});
