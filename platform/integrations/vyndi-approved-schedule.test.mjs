import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fingerprintProposedBaseline,
  evaluateApprovedProgramSchedule,
  prepareScheduleEscalationRecommendation,
  candidateFromVyndiProgramRows,
  createAuthorityBoundScheduleEvaluator,
} from './vyndi-approved-schedule.mjs';

const observedAt='2026-10-08T16:00:00.000Z';
function fixture(){
  const baseline={
    schemaVersion:'vyndi.program.baseline.v1',sourceSystem:'VYNDI_OS',
    projectId:'VYNDI-MASTER-PROGRAM',revision:'baseline-r7',
    tasks:[
      {id:'TASK-B',owner:'production',plannedFinish:'2026-10-10T17:00:00+05:30',sourceRef:'vyndi_program_tasks/TASK-B'},
      {id:'TASK-A',owner:'engineering',plannedFinish:'2026-10-07T17:00:00+05:30',sourceRef:'vyndi_program_tasks/TASK-A'},
      {id:'TASK-C',owner:'qa',plannedFinish:'2026-10-06T17:00:00+05:30',sourceRef:'vyndi_program_tasks/TASK-C'},
    ],
  };
  const approval={
    status:'APPROVED',projectId:baseline.projectId,revision:baseline.revision,
    approvedBaselineSha256:fingerprintProposedBaseline(baseline),
    submittedBy:'project-owner',approvedBy:'independent-reviewer',
    approvedAt:'2026-10-07T11:00:00.000Z',approvalRef:'VAOS-APPROVAL-001',
    source:'VAOS_TRUSTED_APPROVAL_REGISTRY',
  };
  const progress={
    schemaVersion:'vyndi.program.progress.v1',sourceSystem:'VYNDI_OS',
    projectId:baseline.projectId,capturedAt:'2026-10-08T15:30:00.000Z',
    tasks:[
      {id:'TASK-A',status:'in_progress',actualFinish:null,sourceRef:'vyndi_program_tasks/TASK-A'},
      {id:'TASK-B',status:'ready',actualFinish:null,sourceRef:'vyndi_program_tasks/TASK-B'},
      {id:'TASK-C',status:'complete',actualFinish:'2026-10-08T10:00:00.000Z',sourceRef:'vyndi_program_tasks/TASK-C'},
    ]
  };
  return {baseline,approval,progress};
}

test('project schedule only evaluates against an independently approved immutable baseline',()=>{
  const f=fixture();
  const result=evaluateApprovedProgramSchedule({...f,observedAt});
  assert.equal(result.status,'VERIFIED');
  assert.equal(result.projectId,'VYNDI-MASTER-PROGRAM');
  assert.deepEqual(result.findings.map(item=>[item.code,item.taskId]),[
    ['BASELINE_DELAY','TASK-A'],['LATE_COMPLETION','TASK-C']]);
  assert.equal(result.approvalRef,'VAOS-APPROVAL-001');
  assert.ok(result.findings.every(item=>item.sourceRef?.startsWith('vyndi_program_tasks/')));
  assert.equal(prepareScheduleEscalationRecommendation(result).status,'HUMAN_REVIEW_REQUIRED');
  assert.equal(prepareScheduleEscalationRecommendation(result).executed,false);
});

test('reordered task rows produce the same provenance fingerprint',()=>{
  const f=fixture();
  const reversed={...f.baseline,tasks:[...f.baseline.tasks].reverse()};
  assert.equal(fingerprintProposedBaseline(reversed), f.approval.approvedBaselineSha256);
});

test('never treat missing approval or self approval as an authoritative baseline',()=>{
  const f=fixture();
  assert.equal(evaluateApprovedProgramSchedule({...f,approval:null,observedAt}).status,'WITHHELD');
  f.approval.approvedBy=f.approval.submittedBy;
  assert.equal(evaluateApprovedProgramSchedule({...f,observedAt}).status,'WITHHELD');
});

test('tampered revised dates fail the hash-gated approval',()=>{
  const f=fixture();
  f.baseline.tasks[0].plannedFinish='2026-11-10T17:00:00+05:30';
  const result=evaluateApprovedProgramSchedule({...f,observedAt});
  assert.equal(result.status,'WITHHELD');
  assert.equal(result.findings.length,0);
});

test('stale or future-dated progress is withheld rather than represented as current',()=>{
  const f=fixture();
  f.progress.capturedAt='2026-10-06T12:00:00.000Z';
  assert.equal(evaluateApprovedProgramSchedule({...f,observedAt}).status,'WITHHELD');
  f.progress.capturedAt='2026-10-09T12:00:00.000Z';
  assert.equal(evaluateApprovedProgramSchedule({...f,observedAt}).status,'WITHHELD');
});

test('date-only without timezone is rejected; missing task progress becomes an evidence gap',()=>{
  const f=fixture();
  f.baseline.tasks[0].plannedFinish='2026-10-10';
  assert.throws(()=>fingerprintProposedBaseline(f.baseline),/BASELINE_TIMESTAMP_INVALID/);
  const g=fixture();
  g.progress.tasks=g.progress.tasks.filter(x=>x.id!=='TASK-A');
  const result=evaluateApprovedProgramSchedule({...g,observedAt});
  assert.equal(result.status,'VERIFIED');
  assert.equal(result.findings[0].code,'MISSING_PROGRESS');
  assert.equal(result.findings[0].taskId,'TASK-A');
});

test('completed tasks without actual completion dates yield gaps not invented delays',()=>{
  const f=fixture(); f.progress.tasks[2].actualFinish=null;
  const result=evaluateApprovedProgramSchedule({...f,observedAt});
  assert.ok(result.findings.some(x=>x.code==='MISSING_ACTUAL_FINISH'&&x.taskId==='TASK-C'));
  assert.ok(!result.findings.some(x=>x.code==='LATE_COMPLETION'&&x.taskId==='TASK-C'));
});

test('escalation proposal cannot authorize dispatch or bypass review',()=>{
  const f=fixture();
  const report=evaluateApprovedProgramSchedule({...f,observedAt});
  const recommendation=prepareScheduleEscalationRecommendation(report);
  assert.equal(recommendation.action,'PROJECT.ESCALATE_BLOCKER');
  assert.equal(recommendation.executed,false);
  assert.equal(recommendation.approvalStatus,'PENDING_HUMAN');
  assert.equal(prepareScheduleEscalationRecommendation({status:'WITHHELD'}).status,'NOT_ELIGIBLE');
});

test('VYNDI program row adapter produces only an unapproved candidate, never a false approval',()=>{
  const rows=[{id:'A',owner:'engineering',planned_finish:'2026-10-15T16:00:00+05:30',source_reference:'vyndi_program_tasks/A'}];
  const candidate=candidateFromVyndiProgramRows(rows,{projectId:'VYNDI-MASTER-PROGRAM',revision:'r1'});
  assert.equal(candidate.schemaVersion,'vyndi.program.baseline.v1');
  assert.equal(candidate.sourceSystem,'VYNDI_OS');
  assert.ok(!('approval' in candidate));
  assert.equal(evaluateApprovedProgramSchedule({baseline:candidate,approval:null,progress:null,observedAt}).status,'WITHHELD');
});

test('authority-bound evaluator ignores caller-supplied approval and obtains only trusted server approval',async()=>{
  const f=fixture();
  const rejected=createAuthorityBoundScheduleEvaluator({
    loadApprovedManifest:async()=>null,
  });
  const bad=await rejected({...f,observedAt});
  assert.equal(bad.status,'WITHHELD');

  let calls=0;
  const trusted=createAuthorityBoundScheduleEvaluator({
    loadApprovedManifest:async({projectId,revision})=>{
      calls+=1;
      assert.equal(projectId,f.baseline.projectId);
      assert.equal(revision,f.baseline.revision);
      return f.approval;
    },
  });
  const r=await trusted({...f,approval:{...f.approval,approvedBy:'forged'},observedAt});
  assert.equal(calls,1);
  assert.equal(r.status,'VERIFIED');
});

test('approval registry connection failure withholds any schedule assessment',async()=>{
  const f=fixture();
  const evaluator=createAuthorityBoundScheduleEvaluator({
    loadApprovedManifest:async()=>{throw new Error('unavailable');},
  });
  const result=await evaluator({...f,observedAt});
  assert.equal(result.status,'WITHHELD');
  assert.equal(result.findings.length,0);
});
