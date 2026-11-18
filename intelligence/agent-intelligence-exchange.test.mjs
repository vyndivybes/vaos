import test from 'node:test';
import assert from 'node:assert/strict';
import { periodForCron, buildExchangeReport } from './agent-intelligence-exchange.mjs';

test('daily, Monday weekly and first-of-month schedules report closed IST periods', () => {
  assert.deepEqual(periodForCron('5,15,25,35,45,55 * * * *', '2026-11-18T02:35:00Z'),
    {kind:'daily',from:'2026-11-17',to:'2026-11-17',date:'2026-11-18'});
  assert.deepEqual(periodForCron('5,15,25,35,45,55 * * * *', '2026-11-23T02:45:00Z'),
    {kind:'weekly',from:'2026-11-16',to:'2026-11-22',date:'2026-11-23'});
  assert.deepEqual(periodForCron('5,15,25,35,45,55 * * * *', '2026-12-01T03:05:00Z'),
    {kind:'monthly',from:'2026-11-01',to:'2026-11-30',date:'2026-12-01'});
  assert.equal(periodForCron('0 * * * *', '2026-11-18T02:00:00Z'),null);
  assert.equal(periodForCron('5,15,25,35,45,55 * * * *','2026-11-18T02:25:00Z'),null);
});

test('missing evidence produces HOLD packets and never counts nonexistent business actuals', () => {
  const report=buildExchangeReport({
    period:periodForCron('5,15,25,35,45,55 * * * *','2026-11-18T02:35:00Z'),
    observedAt:'2026-11-18T02:35:00Z',vaos:null,vyndi:null
  });
  assert.equal(report.schemaVersion,'VAOS_AGENT_EXCHANGE_V1');
  assert.equal(report.agents.length,16);
  assert.equal(report.summary.observedAgents,0);
  assert.equal(report.summary.heldAgents,16);
  assert.equal(report.summary.verifiedLearningImprovements,0);
  assert.equal(report.jarvis.semanticMemoryUpdated,false);
  assert.equal(report.jarvis.multimodalQualified,false);
  assert.ok(report.agents.every(x=>x.status==='HOLD'));
  assert.ok(report.agents.every(x=>x.agentAuthored===false));
});

test('verified source snapshots are sanitised; raw CRM, HR and finance payloads never enter journal', () => {
  const report=buildExchangeReport({
    period:periodForCron('5,15,25,35,45,55 * * * *','2026-11-18T02:35:00Z'),
    observedAt:'2026-11-18T02:35:00Z',
    vaos:{schemaVersion:'VAOS_FOUNDER_ANALYTICS_V1',observedAt:'2026-11-18T02:35:00Z',
      employees:[{id:'orchestrator',sourceStatus:'RECORDED',lifecycle:'READY',work:{total:3,blocked:1,failed:0},
       privateNotes:'SECRET_HR_RECORD'}]},
    vyndi:{schemaVersion:'VYNDI_ENTERPRISE_BI_V1',readOnly:true,scope:'all',
      period:{from:'2026-11-17',to:'2026-11-17'},
      departments:[{employeeId:'finance',status:'OBSERVED',records:[{customer:'SECRET_CUSTOMER'}]}]}
  });
  assert.equal(report.summary.observedAgents,2);
  const orchestrator=report.agents.find(x=>x.id==='orchestrator');
  const finance=report.agents.find(x=>x.id==='finance');
  assert.equal(orchestrator.work.blocked,1);
  assert.equal(finance.status,'OBSERVED');
  assert.equal(report.jarvis.semanticMemoryUpdated,false);
  assert.equal(report.jarvis.reviewRequired,true);
  assert.doesNotMatch(JSON.stringify(report),/SECRET_HR_RECORD|SECRET_CUSTOMER/);
});
