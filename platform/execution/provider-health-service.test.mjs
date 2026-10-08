import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderHealthService } from './provider-health-service.mjs';

test('health service records successful provider probe through control plane', async()=>{
  const recorded=[];
  const service=createProviderHealthService({
    controlPlane:{async recordHealth(input){recorded.push(input);return input}},
    probes:{n8n:async()=>({status:'healthy',evidenceRef:'health:n8n:1'})},
    now:()=>new Date('2026-10-08T00:00:00.000Z'),
  });
  const result=await service.check('n8n');
  assert.equal(result.status,'healthy');
  assert.equal(recorded[0].providerId,'n8n');
  assert.equal(recorded[0].checkedAt,'2026-10-08T00:00:00.000Z');
});

test('probe exception records unhealthy without persisting raw provider message', async()=>{
  const recorded=[];
  const service=createProviderHealthService({
    controlPlane:{async recordHealth(input){recorded.push(input);return input}},
    probes:{n8n:async()=>{throw new Error('Bearer secret-token endpoint failed')}},
  });
  const result=await service.check('n8n');
  assert.equal(result.status,'unhealthy');
  assert.equal(JSON.stringify(recorded).includes('secret-token'),false);
});

test('missing health probe fails closed instead of assuming provider healthy', async()=>{
  const service=createProviderHealthService({
    controlPlane:{async recordHealth(input){return input}},
    probes:{},
  });
  await assert.rejects(()=>service.check('n8n'),/PROVIDER_HEALTH_PROBE_NOT_FOUND/);
});

test('checkAll records each configured probe independently', async()=>{
  const states=[];
  const service=createProviderHealthService({
    controlPlane:{async recordHealth(input){states.push(input);return input}},
    probes:{
      n8n:async()=>({status:'healthy',evidenceRef:'h1'}),
      zapier:async()=>({status:'degraded',evidenceRef:'h2'}),
    },
  });
  const result=await service.checkAll();
  assert.equal(result.length,2);
  assert.deepEqual(result.map(x=>x.providerId),['n8n','zapier']);
  assert.equal(states.length,2);
});
