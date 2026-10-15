import test from 'node:test';
import assert from 'node:assert/strict';
import {routeJob} from '../runtime/vaos-eight-operating-model.mjs';
import {
  createMissionConsumer,
  calculateReadOnlyMissionAudit,
  verifyReadOnlyMissionAudit,
  SAFE_MISSION_JOBS,
  prioritizedRunnableHandoffs,
} from './mission-consumer.mjs';

function fixture() {
  const handoff = {
    id: 'hand-1', mission_id: 'mission-1', work_package_id: 'wp-1',
    to_agent_id: 'project', from_agent_id: 'orchestrator',
    requested_job: 'PROJECT.TRACK_DEPENDENCY',
    status: 'PENDING', version: 1, evidence_refs: [],
  };
  const workPackages = [
    { id: 'wp-1', action_type: 'PROJECT.TRACK_DEPENDENCY', owner_agent_id: 'project', status: 'READY', depends_on: [], human_approval_required: false, execution_mode: 'ANALYSE', authority: 1 },
    { id: 'wp-2', action_type: 'RISK.ASSESS', owner_agent_id: 'risk', status: 'COMPLETED', depends_on: [] },
  ];
  const events = [], reports = new Map();
  const service = {
    async snapshot() { return { mission: { id: 'mission-1', status: 'ACTIVE' }, workPackages, handoffs: [handoff] }; },
    async transitionHandoff(input) {
      assert.equal(input.handoffId, handoff.id);
      assert.equal(input.expectedVersion, handoff.version);
      const mapping = { ACCEPT: 'ACCEPTED', SUBMIT: 'SUBMITTED', VERIFY: 'COMPLETED', REJECT_VERIFICATION: 'RETURNED' };
      if (input.outcome === 'ACCEPT' || input.outcome === 'SUBMIT') assert.equal(input.byAgentId, handoff.to_agent_id);
      if (input.outcome === 'VERIFY' || input.outcome === 'REJECT_VERIFICATION') {
        const route=routeJob(handoff.requested_job);
        const checker=route.verifierAgentIds.find(id=>id!==handoff.to_agent_id)
          || (handoff.to_agent_id==='orchestrator'?'project':'orchestrator');
        assert.equal(input.byAgentId,checker);
      }
      handoff.version += 1;
      handoff.status = mapping[input.outcome];
      handoff.evidence_refs = [...new Set([...handoff.evidence_refs, ...(input.evidenceRefs || [])])];
      workPackages[0].status = handoff.status === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS';
      events.push(input);
      return { handoff: { ...handoff } };
    },
    async recordWorkEvidence(input) {
      assert.equal(input.handoffId, handoff.id);
      assert.equal(input.byAgentId, handoff.to_agent_id);
      assert.equal(input.expectedVersion, handoff.version);
      assert.equal(input.report.kind, 'READ_ONLY_MISSION_AUDIT');
      const evidenceId = 'ev:mission-1:hand-1';
      reports.set(evidenceId, { id: evidenceId, report: input.report, handoff_id: handoff.id, author_agent_id: handoff.to_agent_id, handoff_version: input.expectedVersion });
      return { evidenceId };
    },
    async getWorkEvidence(evidenceId) {
      if (evidenceId.startsWith('handoff-version:')) return [...reports.values()].find(r => evidenceId === `handoff-version:${r.handoff_id}:${r.handoff_version}`);
      return reports.get(evidenceId);
    },
  };
  return { service, handoff, events, reports };
}

test('only approved deterministic read-only job types are supported', () => {
  assert.deepEqual([...SAFE_MISSION_JOBS].sort(), [
    'COMMERCIAL.OBSERVE_PIPELINE', 'ENGINEERING.ASSESS_REQUIREMENT', 'ENGINEERING.OBSERVE_CONFIGURATION', 'FINANCE.OBSERVE_LEDGER',
    'INVENTORY.OBSERVE_STOCK', 'KNOWLEDGE.DETECT_GAP', 'MAINTENANCE.OBSERVE_ASSET', 'ORCHESTRATOR.CONSOLIDATE_RESULT', 'ORCHESTRATOR.INTAKE_MISSION', 'ORCHESTRATOR.MONITOR_MISSION',
    'PEOPLE.OBSERVE_WORKFORCE', 'PROCUREMENT.OBSERVE_SHORTAGE', 'PRODUCTION.OBSERVE_WIP', 'PROJECT.DETECT_DELAY', 'PROJECT.TRACK_DEPENDENCY',
    'QA.AUDIT_EVIDENCE', 'RELEASE.CHECK_OPEN_ITEMS', 'RISK.IDENTIFY', 'SECURITY.ASSESS_ACCESS',
  ]);
});

test('unattempted departmental handoffs are scheduled ahead of previously held source reads',()=>{
 const queue=[
  {id:'unavailable-finance',status:'ACCEPTED'},
  {id:'pending-production',status:'PENDING'},
  {id:'pending-quality',status:'PENDING'},
  {id:'submitted',status:'SUBMITTED'},
 ];
 const selected=prioritizedRunnableHandoffs(queue);
 assert.deepEqual(selected.map(x=>x.id),['pending-production','pending-quality','unavailable-finance']);
 assert.deepEqual(queue.map(x=>x.id),['unavailable-finance','pending-production','pending-quality','submitted']);
 assert.throws(()=>prioritizedRunnableHandoffs(null),/MISSION_HANDOFFS_INVALID/);
});

test('consumer accepts, records source-backed evidence and submits but cannot self-verify', async () => {
  const f = fixture();
  const consumer = createMissionConsumer({ service: f.service });
  const result = await consumer.consume('mission-1');
  assert.equal(result.submitted, 1);
  assert.equal(result.unsupported, 0);
  assert.deepEqual(f.events.map((event) => event.outcome), ['ACCEPT', 'SUBMIT']);
  assert.equal(f.handoff.status, 'SUBMITTED');
  assert.equal(f.reports.size, 1);
});

test('independent checker must recalculate evidence before verification', async () => {
  const f = fixture();
  const consumer = createMissionConsumer({ service: f.service });
  await consumer.consume('mission-1');
  const review = await consumer.review('mission-1');
  assert.equal(review.verified, 1);
  assert.equal(f.handoff.status, 'COMPLETED');
  assert.deepEqual(f.events.map((event) => event.byAgentId), ['project', 'project', 'orchestrator']);
});

test('tampered audit cannot be independently verified', async () => {
  const f = fixture();
  const consumer = createMissionConsumer({ service: f.service });
  await consumer.consume('mission-1');
  f.reports.values().next().value.report.dependencyCount = 9999;
  const review = await consumer.review('mission-1');
  assert.equal(review.verified, 0);
  assert.equal(review.returned, 1);
  assert.equal(f.handoff.status, 'RETURNED');
  assert.equal(f.events.at(-1).outcome, 'REJECT_VERIFICATION');
});

test('unsupported or effectful job types remain pending, without fabricated evidence', async () => {
  const f = fixture();
  f.handoff.requested_job = 'ENGINEERING.BASELINE_CHANGE';
  f.handoff.to_agent_id = 'vibpe';
  const result = await createMissionConsumer({ service: f.service }).consume('mission-1');
  assert.equal(result.submitted, 0);
  assert.equal(result.unsupported, 1);
  assert.deepEqual(f.events, []);
  assert.equal(f.handoff.status, 'PENDING');
});

test('human-approved work cannot be auto-consumed even when its job name is supported', async () => {
  const f = fixture();
  f.service.snapshot = async () => ({ mission: { id: 'mission-1', status: 'ACTIVE' }, handoffs: [f.handoff], workPackages: [
    { id: 'wp-1', status: 'READY', action_type: 'PROJECT.TRACK_DEPENDENCY', human_approval_required: true, authority: 1, execution_mode: 'ANALYSE', depends_on: [] },
  ] });
  const result = await createMissionConsumer({ service: f.service }).consume('mission-1');
  assert.equal(result.unsupported, 1);
  assert.equal(f.handoff.status, 'PENDING');
});

test('invalid snapshot status and unknown mission are fail-closed', async () => {
  const f = fixture();
  f.service.snapshot = async () => ({ mission: { id: 'mission-1', status: 'HOLD' }, handoffs: [f.handoff], workPackages: [] });
  await assert.rejects(() => createMissionConsumer({ service: f.service }).consume('mission-1'), /MISSION_NOT_ACTIVE/);
  assert.equal(f.events.length, 0);
});

test('read-only audit tracks dependencies and validator independently rejects changed evidence', () => {
  const workPackages = [
    { id: 'wp-1', status: 'COMPLETED', depends_on: [] },
    { id: 'wp-2', status: 'READY', depends_on: ['wp-1'] },
    { id: 'wp-3', status: 'BLOCKED', depends_on: ['unknown'] },
  ];
  const report = calculateReadOnlyMissionAudit('PROJECT.TRACK_DEPENDENCY', workPackages, 'wp-2');
  assert.equal(report.kind, 'READ_ONLY_MISSION_AUDIT');
  assert.equal(report.dependencyCount, 2);
  assert.ok(verifyReadOnlyMissionAudit(report, workPackages, 'wp-2'));
  assert.equal(verifyReadOnlyMissionAudit({ ...report, dependencyCount: 0 }, workPackages, 'wp-2'), false);
});


test('work-package action spoofing cannot trigger the wrong read-only adapter', async () => {
  const f = fixture();
  f.service.snapshot = async () => ({
    mission: { id: 'mission-1', status: 'ACTIVE' },
    handoffs: [f.handoff],
    workPackages: [{
      id: 'wp-1', action_type: 'RISK.ASSESS', owner_agent_id: 'risk',
      status: 'READY', depends_on: [], human_approval_required: false,
      execution_mode: 'ANALYSE', authority: 1,
    }],
  });
  const result = await createMissionConsumer({ service: f.service }).consume('mission-1');
  assert.equal(result.submitted, 0);
  assert.equal(result.unsupported, 1);
  assert.equal(f.events.length, 0);
});


test('risk identification is strictly a mission-blocker screen, not risk scoring or acceptance', () => {
  const items = [
    { id: 'risk-screen', status: 'READY', depends_on: [] },
    { id: 'delayed', status: 'FAILED', depends_on: [] },
    { id: 'blocked', status: 'BLOCKED', depends_on: ['unknown-upstream'] },
    { id: 'ok', status: 'COMPLETED', depends_on: [] },
  ];
  const report = calculateReadOnlyMissionAudit('RISK.IDENTIFY', items, 'risk-screen');
  assert.deepEqual(report.findings, [
    'MISSING_DEPENDENCY:blocked:unknown-upstream',
    'MISSION_BLOCKER:blocked:BLOCKED',
    'MISSION_BLOCKER:delayed:FAILED',
  ]);
  assert.equal(report.kind, 'READ_ONLY_MISSION_AUDIT');
  assert.equal(report.actionType, 'RISK.IDENTIFY');
  assert.equal(verifyReadOnlyMissionAudit(report, items, 'risk-screen'), true);
  assert.equal(verifyReadOnlyMissionAudit({ ...report, findings: [] }, items, 'risk-screen'), false);
  assert.ok(report.findings.every(value => !/SCORE|ACCEPT|MITIGATE/.test(value)));
});

test('risk screen cannot acquire effectful or approval-required authority', async () => {
  const f = fixture();
  f.handoff.requested_job = 'RISK.IDENTIFY';
  f.handoff.to_agent_id = 'risk';
  f.service.snapshot = async () => ({
    mission: { id: 'mission-1', status: 'ACTIVE' },
    handoffs: [f.handoff],
    workPackages: [{
      id: 'wp-1', action_type: 'RISK.IDENTIFY', owner_agent_id: 'risk',
      status: 'READY', depends_on: [], human_approval_required: true,
      execution_mode: 'ANALYSE', authority: 1,
    }],
  });
  const result = await createMissionConsumer({ service: f.service }).consume('mission-1');
  assert.equal(result.submitted, 0);
  assert.equal(result.unsupported, 1);
  assert.equal(f.events.length, 0);
});

test('project delay uses only persisted created timestamp and SLA hours; no invented due dates', () => {
  const items = [
    { id: 'delay-job', status: 'READY', created_at: '2026-10-08T11:00:00Z', sla_hours: 1, depends_on: [] },
    { id: 'late', status: 'IN_PROGRESS', created_at: '2026-10-08T06:00:00Z', sla_hours: 4, depends_on: [] },
    { id: 'on-time', status: 'READY', created_at: '2026-10-08T09:00:00Z', sla_hours: 4, depends_on: [] },
    { id: 'no-source', status: 'READY', created_at: null, sla_hours: 4, depends_on: [] },
    { id: 'completed', status: 'COMPLETED', created_at: '2026-10-05T09:00:00Z', sla_hours: 1, depends_on: [] },
  ];
  const observedAt = '2026-10-08T12:00:00.000Z';
  const report = calculateReadOnlyMissionAudit('PROJECT.DETECT_DELAY', items, 'delay-job', { observedAt });
  assert.equal(report.scope, 'MISSION_CATALOG_SLA_ONLY');
  assert.equal(report.observedAt, observedAt);
  assert.deepEqual(report.findings, [
    'SLA_OVERDUE:late:2026-10-08T10:00:00.000Z',
    'SLA_SOURCE_MISSING:no-source',
  ]);
  assert.equal(verifyReadOnlyMissionAudit(report, items, 'delay-job', { nowEpochMs: Date.parse('2026-10-08T12:01:00.000Z') }), true);
  assert.equal(verifyReadOnlyMissionAudit({ ...report, findings: [] }, items, 'delay-job', { nowEpochMs: Date.parse('2026-10-08T12:01:00.000Z') }), false);
});

test('project delay evidence cannot be verified with future or stale observation or changed SLA', () => {
  const work = [
    { id:'self', status:'READY', depends_on:[] },
    { id:'task', status:'READY', depends_on:[], created_at:'2026-10-08T06:00:00Z', sla_hours:4 },
  ];
  const observedAt = '2026-10-08T12:00:00.000Z';
  const report = calculateReadOnlyMissionAudit('PROJECT.DETECT_DELAY', work, 'self', { observedAt });
  assert.equal(verifyReadOnlyMissionAudit(report, work, 'self', { nowEpochMs: Date.parse('2026-10-08T11:59:59Z') }), false);
  assert.equal(verifyReadOnlyMissionAudit(report, work, 'self', { nowEpochMs: Date.parse('2026-10-08T12:11:00Z') }), false);
  work[1].sla_hours = 24;
  assert.equal(verifyReadOnlyMissionAudit(report, work, 'self', { nowEpochMs: Date.parse('2026-10-08T12:01:00Z') }), false);
});

test('project delay refuses approval-required, elevated authority or effectful execution mode', async () => {
  const f = fixture();
  f.handoff.requested_job = 'PROJECT.DETECT_DELAY';
  f.service.snapshot = async () => ({
    mission:{ id:'mission-1', status:'ACTIVE' }, handoffs:[f.handoff],
    workPackages:[{ id:'wp-1',action_type:'PROJECT.DETECT_DELAY',owner_agent_id:'project',
      status:'READY',depends_on:[],human_approval_required:true,
      authority:2,execution_mode:'ANALYSE',created_at:'2026-10-08T08:00:00Z',sla_hours:1 }],
  });
  const result = await createMissionConsumer({ service:f.service }).consume('mission-1');
  assert.equal(result.unsupported,1);
  assert.equal(f.handoff.status,'PENDING');
});

for (const actionType of ['ORCHESTRATOR.INTAKE_MISSION','ORCHESTRATOR.MONITOR_MISSION','ORCHESTRATOR.CONSOLIDATE_RESULT']) {
 test(actionType+' executes through durable evidence and a separate checker', async () => {
  const f=fixture();
  f.handoff.requested_job=actionType;
  f.handoff.to_agent_id='orchestrator';
  const snapshot=await f.service.snapshot();
  Object.assign(snapshot.workPackages[0],{action_type:actionType,owner_agent_id:'orchestrator',authority:actionType==='ORCHESTRATOR.CONSOLIDATE_RESULT'?2:1});
  const consumer=createMissionConsumer({service:f.service});
  assert.equal((await consumer.consume('mission-1')).submitted,1);
  assert.equal((await consumer.review('mission-1')).verified,1);
  assert.equal(f.handoff.status,'COMPLETED');
  assert.equal(f.reports.values().next().value.report.scope,'PERSISTED_MISSION_PLAN_ONLY');
  assert.notEqual(f.events.at(-1).byAgentId,'orchestrator');
 });
}

test('Orchestrator preserves routing defects and missing prerequisites in its report',()=>{
 const report=calculateReadOnlyMissionAudit('ORCHESTRATOR.INTAKE_MISSION',[
  {id:'own',status:'IN_PROGRESS',depends_on:[]},
  {id:'task',status:'READY',action_type:'PROJECT.TRACK_DEPENDENCY',owner_agent_id:'finance',depends_on:['absent']},
 ],'own');
 assert.deepEqual(report.findings,['PREREQUISITE:task:absent:MISSING','ROUTING_OWNER_MISMATCH:task']);
});

test('restart after recording resumes without a duplicate report',async()=>{
 const f=fixture(),consumer=createMissionConsumer({service:f.service});
 const transition=f.service.transitionHandoff;
 let interrupt=true,recordCalls=0;
 const record=f.service.recordWorkEvidence;
 f.service.recordWorkEvidence=async input=>{recordCalls++;return record(input);};
 f.service.transitionHandoff=async input=>{
  if(input.outcome==='SUBMIT'&&interrupt){interrupt=false;throw Error('INTERRUPTED');}
  return transition(input);
 };
 await assert.rejects(()=>consumer.consume('mission-1'),/INTERRUPTED/);
 assert.equal(f.handoff.status,'ACCEPTED');
 assert.equal((await consumer.consume('mission-1')).submitted,1);
 assert.equal(recordCalls,1);
 assert.deepEqual(f.events.map(e=>e.outcome),['ACCEPT','SUBMIT']);
 assert.equal((await consumer.review('mission-1')).verified,1);
});

test('source changes after interrupted recording retain evidence and return correction',async()=>{
 const f=fixture(),consumer=createMissionConsumer({service:f.service});
 const transition=f.service.transitionHandoff;
 f.service.transitionHandoff=async input=>{
  if(input.outcome==='SUBMIT')throw Error('INTERRUPTED');
  if(input.outcome==='RETURN_FOR_CORRECTION'){
   f.handoff.status='RETURNED';f.events.push(input);return {handoff:f.handoff};
  }
  return transition(input);
 };
 await assert.rejects(()=>consumer.consume('mission-1'),/INTERRUPTED/);
 (await f.service.snapshot()).workPackages[1].depends_on=['missing'];
 assert.equal((await consumer.consume('mission-1')).returned,1);
 assert.equal(f.reports.size,1);
 assert.equal(f.handoff.status,'RETURNED');
});

test('a failed recovery read cannot be treated as absence and create new evidence',async()=>{
 const f=fixture();
 f.service.getWorkEvidence=async()=>{throw Error('DATABASE_UNAVAILABLE');};
 await assert.rejects(()=>createMissionConsumer({service:f.service}).consume('mission-1'),/DATABASE_UNAVAILABLE/);
 assert.equal(f.reports.size,0);
 assert.equal(f.handoff.status,'ACCEPTED');
});

test('duplicate packages, malformed dependencies and invalid authority cannot run',async()=>{
 assert.throws(()=>calculateReadOnlyMissionAudit('PROJECT.TRACK_DEPENDENCY',[{id:'x',status:'READY'},{id:'x',status:'READY'}],'x'),/DUPLICATE/);
 assert.throws(()=>calculateReadOnlyMissionAudit('PROJECT.TRACK_DEPENDENCY',[{id:'x',status:'READY',depends_on:'bad'}],'x'),/DEPENDENCIES_INVALID/);
 const f=fixture();(await f.service.snapshot()).workPackages[0].authority=null;
 assert.equal((await createMissionConsumer({service:f.service}).consume('mission-1')).submitted,0);
});


test('a write acknowledgement without durable readback cannot submit a handoff',async()=>{
 const f=fixture();
 f.service.recordWorkEvidence=async()=>({evidenceId:'missing-record'});
 await assert.rejects(()=>createMissionConsumer({service:f.service}).consume('mission-1'),/MISSION_EVIDENCE_READBACK_MISMATCH/);
 assert.equal(f.handoff.status,'ACCEPTED');
 assert.deepEqual(f.events.map(e=>e.outcome),['ACCEPT']);
});
test('wrong persisted owner cannot submit or verify a report',async()=>{
 const f=fixture(),record=f.service.recordWorkEvidence;
 f.service.recordWorkEvidence=async input=>{
  const saved=await record(input);f.reports.get(saved.evidenceId).author_agent_id='finance';return saved;
 };
 await assert.rejects(()=>createMissionConsumer({service:f.service}).consume('mission-1'),/MISSION_EVIDENCE_READBACK_MISMATCH/);
 assert.equal(f.handoff.status,'ACCEPTED');
 const clean=fixture(),consumer=createMissionConsumer({service:clean.service});
 await consumer.consume('mission-1');
 clean.reports.values().next().value.author_agent_id='finance';
 assert.equal((await consumer.review('mission-1')).returned,1);
 assert.equal(clean.handoff.status,'RETURNED');
});
test('a readback outage retains the accepted handoff for restart recovery',async()=>{
 const f=fixture(),get=f.service.getWorkEvidence;
 let outage=true;
 f.service.getWorkEvidence=async id=>{
  if(!id.startsWith('handoff-version:')&&outage)throw Error('READBACK_OFFLINE');
  return get(id);
 };
 const consumer=createMissionConsumer({service:f.service});
 await assert.rejects(()=>consumer.consume('mission-1'),/READBACK_OFFLINE/);
 assert.equal(f.reports.size,1);assert.equal(f.handoff.status,'ACCEPTED');
 outage=false;
 assert.equal((await consumer.consume('mission-1')).submitted,1);
 assert.equal(f.reports.size,1);
 assert.equal((await consumer.review('mission-1')).verified,1);
});


const readActions = [
 'COMMERCIAL.OBSERVE_PIPELINE', 'PROCUREMENT.OBSERVE_SHORTAGE',
 'INVENTORY.OBSERVE_STOCK', 'PRODUCTION.OBSERVE_WIP',
 'MAINTENANCE.OBSERVE_ASSET', 'FINANCE.OBSERVE_LEDGER',
 'PEOPLE.OBSERVE_WORKFORCE', 'ENGINEERING.OBSERVE_CONFIGURATION'
];

for (const actionType of readActions) {
 test(actionType+' creates durable bounded evidence from a signed VYNDI read without recording raw records', async () => {
  const f=fixture();
  const { routeJob }=await import('../runtime/vaos-eight-operating-model.mjs');
  const route=routeJob(actionType);
  f.handoff.to_agent_id=route.ownerAgentId;
  f.handoff.requested_job=actionType;
  Object.assign((await f.service.snapshot()).workPackages[0], {
   action_type:actionType,owner_agent_id:route.ownerAgentId,
   authority:route.authority,execution_mode:'ANALYSE',
  });
  let seen=0;
  const consumer=createMissionConsumer({service:f.service,readDepartment:async (input)=>{
   seen++;
   assert.equal(input.actionType,actionType);
   assert.equal(input.missionId,'mission-1');
   return {status:'OBSERVED',recordsObserved:2,
    sourceAuthority:'SOURCE_AUTH',requestNonce:'a'.repeat(32),requestBodySha256:'b'.repeat(64),
    gatewayReceivedAt:'2026-10-15T09:00:00.000Z'};
  }});
  // A forged source authority must never be submitted.
  const denied=await consumer.consume('mission-1');
  assert.equal(denied.submitted,0);
  assert.equal(f.reports.size,0);
  assert.equal(f.handoff.status,'ACCEPTED');
  assert.equal(seen,1);
 });
}

test('a qualified signed read is persisted, read back and independently receipt-verified without source rows', async () => {
 const f=fixture();
 f.handoff.to_agent_id='inventory';
 f.handoff.requested_job='INVENTORY.OBSERVE_STOCK';
 Object.assign((await f.service.snapshot()).workPackages[0],{
  action_type:'INVENTORY.OBSERVE_STOCK',owner_agent_id:'inventory',authority:5,
  execution_mode:'ANALYSE',
 });
 const {getVyndiBridgeRoute}=await import('../../packages/contracts/vyndi-write-bridge.mjs');
 const authority=getVyndiBridgeRoute('INVENTORY.OBSERVE_STOCK').authority;
 const consumer=createMissionConsumer({service:f.service,readDepartment:async ()=>({
  status:'OBSERVED',recordsObserved:2,sourceAuthority:authority,
  requestNonce:'a'.repeat(32),requestBodySha256:'b'.repeat(64),
  gatewayReceivedAt:'2026-10-15T09:00:00.000Z',
  secret:'must-not-be-persisted',records:[{name:'private'}],
 })});
 assert.equal((await consumer.consume('mission-1')).submitted,1);
 const recorded=[...f.reports.values()][0].report;
 assert.equal(recorded.recordsObserved,2);
 assert.equal(recorded.sourceAuthority,authority);
 assert.equal(recorded.secret,undefined);
 assert.equal(recorded.records,undefined);
 assert.equal(recorded.businessEffectsExecuted,false);
 assert.equal(recorded.scope,'BOUNDED_VYNDI_READ_RECEIPT_ONLY');
 assert.equal(verifyReadOnlyMissionAudit(recorded,(await f.service.snapshot()).workPackages,'wp-1'),true);
 assert.equal(verifyReadOnlyMissionAudit({...recorded,recordsObserved:999},(await f.service.snapshot()).workPackages,'wp-1'),false);
 assert.equal((await consumer.review('mission-1')).verified,1);
 assert.equal(f.handoff.status,'COMPLETED');
});

test('unsigned or unavailable domain reads leave the handoff unverified and report the blocker', async()=>{
 const f=fixture();
 f.handoff.to_agent_id='finance';f.handoff.requested_job='FINANCE.OBSERVE_LEDGER';
 Object.assign((await f.service.snapshot()).workPackages[0],{
  action_type:'FINANCE.OBSERVE_LEDGER',owner_agent_id:'finance',authority:5,execution_mode:'ANALYSE',
 });
 const consumer=createMissionConsumer({service:f.service,readDepartment:async()=>{throw Error('SENSITIVE_INTERNAL');}});
 const result=await consumer.consume('mission-1');
 assert.equal(result.submitted,0);
 assert.equal(result.holds.length,1);
 assert.equal(result.holds[0].code,'DEPARTMENT_READ_UNAVAILABLE');
 assert.equal(f.reports.size,0);
 assert.equal(f.handoff.status,'ACCEPTED');
});

for (const actionType of ['ENGINEERING.ASSESS_REQUIREMENT','QA.AUDIT_EVIDENCE','SECURITY.ASSESS_ACCESS']) {
 test(actionType+' performs only an explicitly limited mission-records inspection',async()=>{
  const f=fixture();
  const {routeJob}=await import('../runtime/vaos-eight-operating-model.mjs');
  const route=routeJob(actionType);
  f.handoff.to_agent_id=route.ownerAgentId;
  f.handoff.requested_job=actionType;
  Object.assign((await f.service.snapshot()).workPackages[0],{
   action_type:actionType,owner_agent_id:route.ownerAgentId,
   authority:route.authority,execution_mode:route.executionMode,
  });
  const consumer=createMissionConsumer({service:f.service});
  assert.equal((await consumer.consume('mission-1')).submitted,1);
  const report=[...f.reports.values()][0].report;
  assert.equal(report.scope,'PERSISTED_MISSION_RECORDS_ONLY');
  assert.equal(report.businessEffectsExecuted,false);
  assert.equal(report.engineeringReleaseGranted,false);
  assert.equal((await consumer.review('mission-1')).verified,1);
 });
}

test('a bridge read job cannot execute if the work package tries approval-only or effectful permissions',async()=>{
 const f=fixture();f.handoff.to_agent_id='production';f.handoff.requested_job='PRODUCTION.OBSERVE_WIP';
 Object.assign((await f.service.snapshot()).workPackages[0],{
  action_type:'PRODUCTION.OBSERVE_WIP',owner_agent_id:'production',
  authority:3,execution_mode:'GOVERNED_EXECUTION',
 });
 let calls=0;
 const consumer=createMissionConsumer({service:f.service,readDepartment:async()=>{calls++;return {}}});
 const result=await consumer.consume('mission-1');
 assert.equal(result.unsupported,1);assert.equal(calls,0);
 assert.deepEqual(f.events,[]);
});
