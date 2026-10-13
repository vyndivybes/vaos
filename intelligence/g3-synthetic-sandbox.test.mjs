import test from 'node:test';
import assert from 'node:assert/strict';
import {optimizeSandboxSchedule, simulateSandboxRisk, G3_RESEARCH_ONLY} from './g3-synthetic-sandbox.mjs';
const planning={mode:'SYNTHETIC_ONLY',horizonDays:8,
 resources:[{id:'MOLD',capacity:1},{id:'QA',capacity:1}],
 jobs:[
  {id:'LAYUP',resource:'MOLD',durationDays:2,releaseDay:0,deadlineDay:6,dependsOn:[],ready:true},
  {id:'CURE',resource:'MOLD',durationDays:2,releaseDay:0,deadlineDay:7,dependsOn:['LAYUP'],ready:true},
  {id:'INSPECT',resource:'QA',durationDays:1,releaseDay:0,deadlineDay:8,dependsOn:['CURE'],ready:true}
 ]};
test('G3 schedules precedence and resource capacity using a bounded exact search, without production certification',()=>{
 const s=optimizeSandboxSchedule(planning);
 assert.equal(s.status,'OPTIMAL_SYNTHETIC');
 assert.equal(s.makespanDays,5);
 assert.equal(s.searchCompleted,true);
 assert.equal(s.productionPlanningQualified,false);
 assert.equal(s.businessDataRead,false);
 assert.equal(s.actionAuthorized,false);
 const by=Object.fromEntries(s.schedule.map(x=>[x.id,x]));
 assert.equal(by.CURE.startDay>=by.LAYUP.endDay,true);
 assert.equal(by.INSPECT.startDay>=by.CURE.endDay,true);
 assert.deepEqual(optimizeSandboxSchedule(planning),s);
});
test('G3 solver handles scarce resources and searches for the minimum feasible makespan',()=>{
 const s=optimizeSandboxSchedule({...planning,jobs:[
  {id:'A',resource:'MOLD',durationDays:2,releaseDay:0,deadlineDay:8,dependsOn:[],ready:true},
  {id:'B',resource:'MOLD',durationDays:2,releaseDay:0,deadlineDay:8,dependsOn:[],ready:true},
  {id:'C',resource:'QA',durationDays:1,releaseDay:0,deadlineDay:8,dependsOn:['A'],ready:true}
 ]});
 assert.equal(s.status,'OPTIMAL_SYNTHETIC');
 assert.equal(s.makespanDays,4);
 const a=s.schedule.find(x=>x.id==='A'),b=s.schedule.find(x=>x.id==='B');
 assert.equal(a.endDay<=b.startDay||b.endDay<=a.startDay,true);
});
test('G3 rejects infeasible plans and blocks unreleased engineering assumptions',()=>{
 const no=optimizeSandboxSchedule({...planning,horizonDays:2,jobs:[{...planning.jobs[0],deadlineDay:2},
 {...planning.jobs[1],durationDays:2,deadlineDay:2}]});
 assert.equal(no.status,'INFEASIBLE_SYNTHETIC');
 assert.equal(no.actionAuthorized,false);
 const hold=optimizeSandboxSchedule({...planning,jobs:[{...planning.jobs[0],ready:false}]});
 assert.equal(hold.status,'INPUT_RELEASE_HOLD');
 assert.equal(hold.schedule.length,0);
});
test('G3 rejects production, untrusted or unbounded inputs and cyclic dependencies',()=>{
 for(const input of [
  {...planning,mode:'PRODUCTION'},
  {...planning,allowProductionExecution:true},
  {...planning,resources:[{id:'MOLD',capacity:99}]},
  {...planning,jobs:[{...planning.jobs[0],cost:90000}]},
  {...planning,jobs:[{...planning.jobs[0],dependsOn:['CURE']}]},
  {...planning,jobs:[{...planning.jobs[0],id:'CONTACT@example.com'}]},
  {...planning,jobs:[{...planning.jobs[0],durationDays:-2}]},
  {...planning,horizonDays:1000},
 ])assert.throws(()=>optimizeSandboxSchedule(input),/G3_INPUT_INVALID/);
});
test('G3 scenario Monte Carlo is seeded, monotonic and never a calibrated business forecast',()=>{
 const r={mode:'SYNTHETIC_ONLY',seed:123456,iterations:256,deadlineDay:9,tasks:[
   {id:'MATERIAL',minDays:1,mostLikelyDays:2,maxDays:4,dependsOn:[]},
   {id:'FEA',minDays:2,mostLikelyDays:3,maxDays:5,dependsOn:['MATERIAL']},
   {id:'PLANNING',minDays:1,mostLikelyDays:2,maxDays:3,dependsOn:[]},
 ]};
 const a=simulateSandboxRisk(r),b=simulateSandboxRisk(r);
 assert.deepEqual(a,b);
 assert.equal(a.status,'UNCALIBRATED_SYNTHETIC_SCENARIOS');
 assert.equal(a.samples,256);
 assert.ok(a.p10Days<=a.p50Days&&a.p50Days<=a.p90Days);
 assert.ok(a.probabilityWithinDeadline>=0&&a.probabilityWithinDeadline<=1);
 assert.equal(a.productionForecastCertified,false);
 assert.equal(a.calibratedWithActualOutcomes,false);
 assert.equal(a.actionAuthorized,false);
 assert.equal(G3_RESEARCH_ONLY,true);
});
test('G3 Monte Carlo honors dependency longest-path rather than summing parallel tasks',()=>{
 const a=simulateSandboxRisk({mode:'SYNTHETIC_ONLY',seed:42,iterations:128,deadlineDay:4,tasks:[
  {id:'A',minDays:2,mostLikelyDays:2,maxDays:2,dependsOn:[]},
  {id:'B',minDays:3,mostLikelyDays:3,maxDays:3,dependsOn:[]}
 ]});
 assert.equal(a.p50Days,3);
 assert.equal(a.probabilityWithinDeadline,1);
 const b=simulateSandboxRisk({mode:'SYNTHETIC_ONLY',seed:42,iterations:128,deadlineDay:4,tasks:[
  {id:'A',minDays:2,mostLikelyDays:2,maxDays:2,dependsOn:[]},
  {id:'B',minDays:3,mostLikelyDays:3,maxDays:3,dependsOn:['A']}
 ]});
 assert.equal(b.p50Days,5);
 assert.equal(b.probabilityWithinDeadline,0);
});
test('G3 Monte Carlo rejects invented confidence, unknown inputs, bad ranges and cycles',()=>{
 const base={mode:'SYNTHETIC_ONLY',seed:42,iterations:128,deadlineDay:5,tasks:[
  {id:'A',minDays:1,mostLikelyDays:2,maxDays:3,dependsOn:[]}
 ]};
 for(const input of [
  {...base,mode:'LIVE'},
  {...base,actualData:true},
  {...base,seed:-1},
  {...base,iterations:10000},
  {...base,tasks:[{...base.tasks[0],maxDays:1}]},
  {...base,tasks:[{...base.tasks[0],dependsOn:['A']}]},
  {...base,tasks:[{...base.tasks[0],reference:'private data'}]}
 ])assert.throws(()=>simulateSandboxRisk(input),/G3_INPUT_INVALID/);
});
