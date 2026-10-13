import test from 'node:test';
import assert from 'node:assert/strict';
import {planJarvisCoordination, reconcileJarvisAssessmentRows} from './jarvis-coordination.mjs';
import {VAOS_WORKFORCE_AGENT_IDS} from '../platform/runtime/vaos-eight-operating-model.mjs';
import {createJarvisCoordinationHandler} from '../apps/web/api/jarvis-coordination.mjs';
import {createSessionToken,SESSION_COOKIE} from '../apps/web/lib/auth.mjs';
import {createCloudflareApp} from '../apps/web/cloudflare-worker.mjs';
const now=Date.parse('2026-10-13T12:00:00Z');
const fixture=()=>({workforce:{digitalEmployees:VAOS_WORKFORCE_AGENT_IDS.map(id=>({id,status:'ACTIVE',qualificationLevel:4,heartbeatAt:'2026-10-13T11:00:00Z',privateNotes:'DO_NOT_EXPORT',qualificationAssessment:{status:'PASS'}}))}});
test('canonical owners and independent verifiers are proposals even with recorded PASS/Q4',()=>{
 const x=planJarvisCoordination(fixture(),{now});
 assert.deepEqual(x.reviews.map(r=>[r.domain,r.owner.id,r.verifier.id]),[
  ['PROCUREMENT','procurement','qa'],['INVENTORY','inventory','qa'],
  ['PRODUCTION','production','qa'],['ENGINEERING','engineering-configuration','vibpe']]);
 assert.equal(x.dispatchedAgents,0);assert.equal(x.agentDispatchAuthorized,false);
 assert.equal(x.qualificationCertified,false);
 assert.ok(x.reviews.every(r=>r.status==='REVIEW_PROPOSAL_ONLY'&&r.owner.runtimeVerified===false&&r.owner.independentCompetenceVerified===false));
 assert.doesNotMatch(JSON.stringify(x),/DO_NOT_EXPORT|qualificationAssessment/);
});
test('recorded role floors, lifecycle and corrupt levels cannot admit a proposal',()=>{
 for(const patch of [{qualificationLevel:3},{qualificationLevel:5},{qualificationLevel:'4'},{status:'RESTRICTED'}]){
  const s=fixture();Object.assign(s.workforce.digitalEmployees.find(r=>r.id==='engineering-configuration'),patch);
  assert.equal(planJarvisCoordination(s,{now}).reviews[3].status,'RECORDED_QUALIFICATION_HOLD');
 }
 const s=fixture();s.workforce.digitalEmployees.find(r=>r.id==='qa').qualificationLevel=2;
 assert.ok(planJarvisCoordination(s,{now}).reviews.slice(0,3).every(r=>r.status==='RECORDED_QUALIFICATION_HOLD'));
});
test('heartbeats distinguish stale, absent and future; none proves runtime',()=>{
 for(const [stamp,expected] of [['2026-10-11T00:00:00Z','STALE_RECORD'],[null,'MISSING_OR_INVALID'],['2026-10-14T00:00:00Z','MISSING_OR_INVALID']]){
  const s=fixture();s.workforce.digitalEmployees.find(r=>r.id==='procurement').heartbeatAt=stamp;
  assert.equal(planJarvisCoordination(s,{now}).reviews[0].owner.heartbeatEvidence,expected);
 }
});
test('incomplete, duplicate and unknown roster fails closed',()=>{
 const s=fixture();s.workforce.digitalEmployees.pop();assert.throws(()=>planJarvisCoordination(s,{now}));
 for(const id of ['procurement','invented']){
  const s=fixture();s.workforce.digitalEmployees[0].id=id;assert.throws(()=>planJarvisCoordination(s,{now}));
 }
});
test('real Worker boundary enforces founder, GET and no client-supplied evidence before reads',async()=>{
 let reads=0;
 const h=createJarvisCoordinationHandler({getControlService:()=>({snapshot:async()=>{reads++;return fixture();}}),now:()=>now});
 const app=createCloudflareApp({apiHandlers:{'/api/jarvis-coordination':h},assetFetcher:()=>new Response('',{status:404}),runtimeEnv:{}});
 const cookie=email=>`${SESSION_COOKIE}=${createSessionToken(email)}`;
 for(const [email,method,query,code] of [[null,'GET','',401],['kaaviyam1519@gmail.com','GET','',403],['shyamsundhar1982@gmail.com','POST','',405],['shyamsundhar1982@gmail.com','GET','?qualified=true',422]]){
  const r=await app.fetch(new Request('https://vaos.example/api/jarvis-coordination'+query,{method,headers:email?{cookie:cookie(email)}:{}}));
  assert.equal(r.status,code);
 }
 assert.equal(reads,0);
 const r=await app.fetch(new Request('https://vaos.example/api/jarvis-coordination',{headers:{cookie:cookie('shyamsundhar1982@gmail.com')}}));
 assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');
 assert.equal((await r.json()).data.dispatchedAgents,0);assert.equal(reads,1);
});
test('unavailable authoritative snapshot returns redacted HOLD',async()=>{
 const handler=createJarvisCoordinationHandler({getControlService:()=>({snapshot:async()=>{throw Error('secret-value');}})});
 let body,code;
 const res={setHeader(){},status(n){code=n;return this},json(x){body=x}};
 await handler({method:'GET',url:'https://vaos.example/api/jarvis-coordination',headers:{cookie:`${SESSION_COOKIE}=${createSessionToken('shyamsundhar1982@gmail.com')}`}},res);
 assert.equal(code,503);assert.doesNotMatch(JSON.stringify(body),/secret-value/);
});

test('sixteen PASS ledger rows covering fifteen identities do not satisfy sixteen-employee assessment coverage',()=>{
 const rows=VAOS_WORKFORCE_AGENT_IDS.filter(employeeId=>employeeId!=='orchestrator')
  .map(employeeId=>({employeeId,status:'PASS'}));
 rows.push({employeeId:'knowledge',status:'PASS'});
 const coverage=reconcileJarvisAssessmentRows(rows);
 assert.equal(coverage.recordedPassRows,16);
 assert.equal(coverage.distinctEmployeesWithPass,15);
 assert.deepEqual(coverage.missingPassEmployeeIds,['orchestrator']);
 assert.deepEqual(coverage.repeatedPassEmployeeIds,['knowledge']);
 assert.equal(coverage.status,'RECORDED_PASS_COVERAGE_HOLD');
 assert.equal(coverage.qualifiedForDispatch,false);
 assert.equal(coverage.independentEvidenceVerified,false);
 assert.doesNotMatch(JSON.stringify(coverage),/assessedBy|evidenceRefs/);
});
test('complete recorded PASS coverage still never qualifies operational competence or dispatch',()=>{
 const rows=VAOS_WORKFORCE_AGENT_IDS.map(employeeId=>({employeeId,status:'PASS'}));
 const coverage=reconcileJarvisAssessmentRows(rows);
 assert.equal(coverage.distinctEmployeesWithPass,16);
 assert.equal(coverage.status,'RECORDED_PASS_COVERAGE_ONLY');
 assert.equal(coverage.independentEvidenceVerified,false);
 assert.equal(coverage.qualifiedForDispatch,false);
});
test('assessment coverage evidence rejects unknown identity, malformed status and excess records',()=>{
 for(const rows of [[{employeeId:'invented',status:'PASS'}],[{employeeId:'qa',status:'pass'}],Array(257).fill({employeeId:'qa',status:'PASS'})]){
  assert.throws(()=>reconcileJarvisAssessmentRows(rows),/ASSESSMENT_COVERAGE_INPUT_INVALID/);
 }
});
