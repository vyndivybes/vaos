import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeFounderLaunch} from './founder-launch-summary.mjs';

const owners=['orchestrator','project','vibpe','qa','risk','security','knowledge','release',
 'commercial','procurement','inventory','production','maintenance','finance','people','engineering-configuration'];
const employees=owners.map(id=>({id,name:id,roleFloorMet:true,status:'ACTIVE',qualificationLevel:2}));
const outputs=owners.map(id=>({
 employeeId:id,status:'DRAFT_PREPARED',title:id+' preparation',
 actionType:id.toUpperCase()+'.OBSERVE',sourceState:id==='inventory'?'SOURCE_UNAVAILABLE':'PRELAUNCH_RECORDS',
 missingInputs:['owner','sourceRef'],steps:['Prepare '+id+' operating inputs','Review approved evidence'],
 actionControls:{businessEffectExecuted:false,scope:'STARTUP_WORKSHEET_AND_ACTION_PLAN_ONLY'}
}));
const teamRun={
 requestId:'test-16-drafts',operation:'PREPARE_ALL',preparedAt:'2026-10-14T17:56:45Z',
 outputs,businessEffectsExecuted:false
};
function launch(extra={}){return summarizeFounderLaunch({
 employees,history:[{operation:'PREPARE_EMPLOYEE',outputs:[outputs[0]]},teamRun],
 observations:{inventory:{status:'HOLD'},finance:{status:'OBSERVED',count:0}},
 ...extra});}

test('founder launch summarizes the existing saved 16-role startup batch without presenting drafts as execution',()=>{
 const brief=launch();
 assert.equal(brief.status,'PREPARATION_RECORDED');
 assert.equal(brief.recordedDrafts,16);
 assert.equal(brief.workforceReady,16);
 assert.equal(brief.businessEffectsExecuted,false);
 assert.equal(brief.sourceHolds,1);
 assert.equal(brief.emptyLedgers,1);
 assert.equal(brief.sourceUnavailableDrafts,1);
 assert.equal(brief.nextAction.employeeId,'orchestrator');
 assert.equal(brief.nextAction.description,'Prepare orchestrator operating inputs');
 assert.equal(brief.tracks.length,4);
 assert.equal(brief.tracks.flatMap(t=>t.roles).length,16);
 assert.ok(brief.tracks.every(t=>t.roles.every(r=>r.status==='DRAFT_PREPARED')));
 assert.equal(brief.canonicalStatus,'RECORDED_PREPARATION_ONLY');
 assert.ok(brief.tracks.some(t=>t.roles.some(r=>r.employeeId==='inventory'&&r.sourceState==='SOURCE_UNAVAILABLE')));
});

test('founder launch rejects missing or incomplete saved evidence and does not claim a prepared launch',()=>{
 const none=summarizeFounderLaunch({employees,history:[],observations:{}});
 assert.equal(none.status,'NOT_PREPARED');
 assert.equal(none.recordedDrafts,0);
 assert.equal(none.nextAction,null);
 const incomplete=launch({history:[{...teamRun,outputs:outputs.slice(0,15)}]});
 assert.equal(incomplete.status,'EVIDENCE_INCOMPLETE');
 assert.equal(incomplete.recordedDrafts,0);
 const duplicate=launch({history:[{...teamRun,outputs:[...outputs.slice(0,15),outputs[0]]}]});
 assert.equal(duplicate.status,'EVIDENCE_INCOMPLETE');
});

test('founder launch never labels an unqualified role, simulated company record or claimed business effect as operational',()=>{
 const oneUnqualified=employees.map(e=>e.id==='qa'?{...e,roleFloorMet:false}:e);
 const held=launch({employees:oneUnqualified});
 assert.equal(held.status,'WORKFORCE_HOLD');
 assert.equal(held.workforceReady,15);
 const claimed=launch({history:[{...teamRun,businessEffectsExecuted:true}]});
 assert.equal(claimed.status,'EVIDENCE_INCOMPLETE');
 const dangerous=launch({history:[{...teamRun,outputs:outputs.map(o=>o.employeeId==='finance'
  ? {...o,actionControls:{businessEffectExecuted:true}}:o)}]});
 assert.equal(dangerous.status,'EVIDENCE_INCOMPLETE');
});

test('launcher is visible from main dashboard and shows existing startup drafts as readable action cards',async()=>{
 const {readFile}=await import('node:fs/promises');
 const [workspace,prelaunch,script]=await Promise.all([
  readFile(new URL('../workspace.html',import.meta.url),'utf8'),
  readFile(new URL('../prelaunch-workspace.html',import.meta.url),'utf8'),
  readFile(new URL('../prelaunch-workspace.mjs',import.meta.url),'utf8')]);
 assert.match(workspace,/href="\/prelaunch-workspace\.html"/);
 assert.match(prelaunch,/id="launch-brief"/);
 assert.match(prelaunch,/id="launch-metrics"/);
 assert.match(prelaunch,/id="launch-tracks"/);
 assert.match(script,/summarizeFounderLaunch/);
 assert.match(script,/function renderLaunchBrief/);
 assert.match(script,/Technical source evidence/);
 assert.doesNotMatch(script,/innerHTML\s*=/);
});
