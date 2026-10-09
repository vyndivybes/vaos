import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateWatchdog} from '../../scripts/qualification/verify-infisical-watchdog.mjs';
const now = new Date('2026-10-09T02:30:00Z');
const run = { id: 123, name:'infisical-scoped-commissioning', event:'schedule', created_at:'2026-10-09T02:15:00Z', status:'completed', conclusion:'success',html_url:'https://github.com/vyndivybes/vaos/actions/runs/123'};
const production = {watchdog:{identityId:'github-infisical-production-watchdog',lastAuthenticatedAt:'2026-10-09T02:15:30Z',health:{status:'healthy', checkedAt:'2026-10-09T02:16:00Z', evidenceRef:run.html_url}}};
test('accepts a scheduled successful run independently corroborated by production readback', () => {
 assert.equal(evaluateWatchdog({runs:[run],production,now}).outcome,'PASS');
});
test('rejects manual runs even when they succeeded', () => {
 assert.ok(evaluateWatchdog({runs:[{...run,event:'workflow_dispatch'}],production,now}).reasons.includes('NO_SCHEDULED_EXECUTION'));
});
test('rejects stale checks and missed cycles', () => {
 assert.ok(evaluateWatchdog({runs:[{...run,created_at:'2026-10-09T01:00:00Z'}],production,now}).reasons.includes('SCHEDULED_EXECUTION_STALE'));
});
test('rejects an otherwise healthy record belonging to a different run', () => {
 const p=structuredClone(production);p.watchdog.health.evidenceRef='https://github.com/vyndivybes/vaos/actions/runs/999';
 assert.ok(evaluateWatchdog({runs:[run],production:p,now}).reasons.includes('EVIDENCE_RUN_MISMATCH'));
});
test('rejects missing authenticated production identity', () => {
 const p=structuredClone(production);p.watchdog.identityId='commissioning-agent';
 assert.ok(evaluateWatchdog({runs:[run],production:p,now}).reasons.includes('IDENTITY_MISMATCH'));
});
test('rejects failed scheduled execution regardless of apparent healthy state',()=>{
 assert.ok(evaluateWatchdog({runs:[{...run,conclusion:'failure'}],production,now}).reasons.includes('SCHEDULED_EXECUTION_UNSUCCESSFUL'));
});
