import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveEvidenceView,resolveEvidencePeriod,filterEvidenceRows} from './executive-evidence-model.mjs';

const packet=(departments,overrides={})=>({
 schemaVersion:'VYNDI_ENTERPRISE_BI_V1',readOnly:true,scope:'all',
 period:{from:'2026-10-10',to:'2026-11-08'},departments,...overrides,
 executiveSignals:{schemaVersion:'VYNDI_EXECUTIVE_SIGNALS_V1',readOnly:true,datasets:{}}
});
test('signed source evidence is counted by observed status, not invented KPI performance',()=>{
 const view=deriveEvidenceView(packet([
  {employeeId:'finance',status:'OBSERVED'},
  {employeeId:'crm',status:'UNAVAILABLE',reason:'No qualified source'},
  {employeeId:'inventory',status:'HOLD'},
  {employeeId:'people',status:'PARTIAL'}
 ]),{from:'2026-10-10',to:'2026-11-08'});
 assert.equal(view.total,4);
 assert.deepEqual(view.counts,{observed:1,attention:2,partial:1,other:0});
 assert.equal(view.businessTruthCertified,false);
 assert.equal(view.actionAuthorized,false);
 assert.equal(view.rows[0].status,'UNAVAILABLE');
 assert.equal(view.rows[0].nextStep,'Investigate this department’s signed source availability');
 assert.equal(view.rows.find(x=>x.id==='finance').sourceObserved,true);
 assert.equal(view.rows.find(x=>x.id==='finance').businessActualsQualified,false);
});
test('wrong source, tampering, period or unsafe count fail closed',()=>{
 for(const bad of [
  packet([], {readOnly:false}),
  packet([], {scope:'qa'}),
  packet([], {period:{from:'2026-10-09',to:'2026-11-08'}}),
  packet([], {schemaVersion:'BAD'}),
  packet([], {departments:{}}),
  packet(Array.from({length:101},(_,i)=>({employeeId:'d'+i,status:'HOLD'}))),
  packet([{employeeId:'finance',status:'OBSERVED'},{employeeId:'finance',status:'OBSERVED'}])
 ]) assert.throws(()=>deriveEvidenceView(bad,{from:'2026-10-10',to:'2026-11-08'}));
});
test('unknown, partial and empty responses remain distinct from success',()=>{
 const view=deriveEvidenceView(packet([{employeeId:'qa',status:'READY'},{employeeId:'engineering',status:'PARTIAL'}]),{from:'2026-10-10',to:'2026-11-08'});
 assert.deepEqual(view.counts,{observed:0,attention:0,partial:1,other:1});
 assert.equal(view.rows.find(x=>x.id==='qa').sourceObserved,false);
 const empty=deriveEvidenceView(packet([]),{from:'2026-10-10',to:'2026-11-08'});
 assert.equal(empty.total,0);assert.equal(empty.status,'NO_DEPARTMENT_EVIDENCE');
});
test('search filters visible source records, without rewriting source counts',()=>{
 const v=deriveEvidenceView(packet([
  {employeeId:'finance',status:'OBSERVED'},
  {employeeId:'qa',status:'HOLD'},
  {employeeId:'people',status:'PARTIAL'}
 ]),{from:'2026-10-10',to:'2026-11-08'});
 assert.deepEqual(filterEvidenceRows(v.rows,{state:'attention'}).map(r=>r.id),['qa']);
 assert.deepEqual(filterEvidenceRows(v.rows,{query:'fin'}).map(r=>r.id),['finance']);
 assert.equal(v.counts.observed,1);
});
test('period presets are bounded and India-local, preserving the selected reporting scope',()=>{
 assert.deepEqual(resolveEvidencePeriod('2026-11-08',30),{from:'2026-10-10',to:'2026-11-08'});
 assert.deepEqual(resolveEvidencePeriod('2026-11-08',7),{from:'2026-11-02',to:'2026-11-08'});
 assert.throws(()=>resolveEvidencePeriod('2026-11-08',0));
 assert.throws(()=>resolveEvidencePeriod('2026-11-08',400));
 assert.throws(()=>resolveEvidencePeriod('2026-02-30',30));
});

test('OBSERVED primary source with unavailable related ledgers is PARTIAL, not healthy',()=>{
 const view=deriveEvidenceView(packet([{employeeId:'qa',department:'Quality assurance',status:'OBSERVED',
  periodEventCount:10,currentAttentionCount:4,coverage:{status:'PARTIAL_OR_UNAVAILABLE',observed:1,expected:3}}]),
  {from:'2026-10-10',to:'2026-11-08'});
 assert.equal(view.rows[0].category,'partial');
 assert.equal(view.rows[0].sourceObserved,true);
 assert.equal(view.rows[0].periodEventCount,10);
 assert.equal(view.rows[0].currentAttentionCount,4);
 assert.equal(view.rows[0].expectedRelatedSources,3);
 assert.equal(view.counts.observed,0);
});
