import test from 'node:test';
import assert from 'node:assert/strict';
import { createExecutionAdapterRegistry } from '../../platform/execution/adapter-registry.mjs';

test('Stirling action is absent when not commissioned', () => {
  const registry = createExecutionAdapterRegistry();
  assert.equal(registry.has('DOCUMENT.TRANSFORM'),false);
});

test('Stirling action delegates only when a runtime is injected', async () => {
  const job = {id:'test-job',actionType:'DOCUMENT.TRANSFORM'};
  const runtime = {async execute(received) {
    assert.equal(received,job);
    return {adapterId:'stirling.transform.v1',verification:{verified:true}};
  }};
  const registry = createExecutionAdapterRegistry({stirlingTransform:runtime});
  assert.equal(registry.has('DOCUMENT.TRANSFORM'),true);
  assert.equal((await registry.get('DOCUMENT.TRANSFORM').execute(job)).verification.verified,true);
});
