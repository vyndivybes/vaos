import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWorkforceCommissioningBoard} from './workforce-commissioning-board.mjs';

const employee=(id,overrides={})=>({
 id,name:id,department:'Test department',
 work:{blocked:0,total:0},workItems:[],
 audit:{status:'UNVERIFIED_NO_REVIEW_LEDGER',pages:[{route:'/command/quality',requiresLedger:true,status:'EVIDENCE_NOT_CONNECTED'}],history:[]},
 defects:{status:'PARTIAL_CAPA_SOURCE',capaCases:[],retests:{status:'NO_VERIFIED_RETEST',events:[]}},
 progress:{status:'NO_APPROVED_BASELINE',baselineCount:0},
 forecast:{status:'NOT_QUALIFIED'},
 reports:{status:'NOT_RECORDED',reports:[]},
 qualificationAssessment:{status:'PASS'},
 ...overrides
});
const full=overrides=>({schemaVersion:'VAOS_FOUNDER_ANALYTICS_V1',actionAuthorized:false,
 employees:Array.from({length:16},(_,i)=>employee('agent'+i,overrides?.[i]||{}))});

test('blocked work always remains blocked and distinguishes physical release from evidence-driven review',()=>{
 const fixture=full({
  0:{work:{blocked:1,total:1},workItems:[{id:'w1',missionId:'M123',actionType:'PRODUCTION.OBSERVE_WIP',status:'BLOCKED'}]},
  1:{work:{blocked:1,total:1},workItems:[{id:'w2',missionId:'M124',actionType:'PROJECT.TRACK_DEPENDENCY',status:'BLOCKED'}]}
 });
 const board=buildWorkforceCommissioningBoard(fixture);
 assert.equal(board.actionAuthorized,false);
 assert.equal(board.blocked.count,2);
 assert.deepEqual(board.blocked.items.map(x=>x.workPackageId),['w1','w2']);
 assert.ok(board.blocked.items.every(x=>x.status==='BLOCKED'&&x.blockerReason==='NOT_IN_VERIFIED_PROJECTION'));
 assert.ok(board.blocked.items.every(x=>x.missionUrl.startsWith('/mission-status.html?missionId=')));
 assert.equal(board.releaseHoldOverridden,false);
});
test('department audits must not infer independent PASS from recorded training PASS',()=>{
 const board=buildWorkforceCommissioningBoard(full());
 assert.equal(board.audit.employeesWithoutCompleteReviewedScope,16);
 assert.equal(board.audit.outstandingRoutes,16);
 assert.equal(board.audit.results[0].verifiedPassedRoutes,0);
 assert.equal(board.audit.results[0].requiredChecks.includes('ledger'),true);
 assert.equal(board.commissioned,false);
});
test('CAPA open cases and missing retests remain open and require independent review',()=>{
 const board=buildWorkforceCommissioningBoard(full({0:{defects:{
  status:'PARTIAL_CAPA_SOURCE',capaCases:[{id:'CAPA-024',status:'OPEN'}],
  retests:{status:'NO_VERIFIED_RETEST',events:[]}}}}));
 assert.equal(board.capa.openCases.length,1);
 assert.equal(board.capa.openCases[0].closureAuthorized,false);
 assert.match(board.capa.openCases[0].nextEvidence,/retest/i);
});
test('forecast and report review remain distinct; recorded reports never imply delivery',()=>{
 const board=buildWorkforceCommissioningBoard(full({0:{reports:{status:'INDEPENDENTLY_VERIFIED',reports:[{id:'rep1'}]}}}));
 assert.equal(board.forecast.employeesWithoutQualifiedForecast,16);
 assert.equal(board.reporting.employeesWithRecordedReports,1);
 assert.equal(board.reporting.outboundDeliveryCertified,false);
 assert.equal(board.commissioned,false);
});
test('malformed status or roster cannot invent a commissioning recommendation',()=>{
 assert.throws(()=>buildWorkforceCommissioningBoard({employees:[]}),/WORKFORCE_BOARD/);
 assert.throws(()=>buildWorkforceCommissioningBoard(full({0:{work:{blocked:1,total:1},workItems:[]}})),/BLOCKED_WORK/);
 assert.throws(()=>buildWorkforceCommissioningBoard(full({0:{id:'agent1'}})),/DUPLICATE_EMPLOYEE/);
});
