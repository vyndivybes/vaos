import test from 'node:test';
import assert from 'node:assert/strict';
import { runScheduledMissionSweep } from './mission-scheduler.mjs';

test('scheduler discovers bounded active missions and runs maker then independent reviewer', async () => {
  const steps = [];
  const service = {
    async listRunnableMissions(input) { steps.push(['list', input.limit]); return { missionIds: ['m-1', 'm-2'] }; },
    async dispatchMission(id, options) { steps.push(['dispatch', id, options.maxAssignments]); return { count: 0 }; },
  };
  const result = await runScheduledMissionSweep({
    service,
    maxMissions: 2,
    maxHandoffs: 3,
    createConsumer: () => ({
      async consume(id, opts) { steps.push(['consume', id, opts.maxHandoffs]); return { submitted: 1, unsupported: 0 }; },
      async review(id, opts) { steps.push(['review', id, opts.maxHandoffs]); return { verified: 1, returned: 0 }; },
    }),
  });
  assert.equal(result.processed, 2);
  assert.equal(result.verified, 2);
  assert.deepEqual(steps.slice(0,4), [
    ['list', 2], ['consume', 'm-1', 3], ['review', 'm-1', 3], ['dispatch', 'm-1', 3],
  ]);
});

test('one mission failure does not abort other missions or suppress its error', async () => {
  const service = {
    async listRunnableMissions() { return { missionIds: ['m-1', 'm-2'] }; },
    async dispatchMission() { return { count: 0 }; },
  };
  const result = await runScheduledMissionSweep({
    service,
    createConsumer: () => ({
      async consume(id) { if (id === 'm-1') throw new Error('FAIL_CLOSED'); return { submitted: 1 }; },
      async review() { return { verified: 0, returned: 0 }; },
    }),
  });
  assert.equal(result.processed, 1);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].missionId, 'm-1');
  assert.equal(result.failures[0].code, 'FAIL_CLOSED');
});

test('scheduler rejects unsupported mission discovery payload and unbounded requests', async () => {
  const service = { async listRunnableMissions() { return { missionIds: ['m-1', 'm-1'] }; } };
  await assert.rejects(runScheduledMissionSweep({ service }), /MISSION_QUEUE_DUPLICATE/);
  await assert.rejects(runScheduledMissionSweep({ service, maxMissions: 500 }), /MISSION_SWEEP_LIMIT_INVALID/);
});


test('Cloudflare schedules bounded worker execution without exposing a public runner route', async () => {
  const { readFile } = await import('node:fs/promises');
  const wrangler = JSON.parse(await readFile(new URL('../../wrangler.jsonc', import.meta.url), 'utf8'));
  assert.deepEqual(wrangler.triggers.crons, ['*/15 * * * *']);
  const worker = await readFile(new URL('../../apps/web/cloudflare-worker.mjs', import.meta.url), 'utf8');
  assert.match(worker, /async scheduled\(/);
  assert.match(worker, /runScheduledMissionSweep/);
  assert.doesNotMatch(worker, /'\/api\/run-agent'/);
});
