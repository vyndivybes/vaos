import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const providerUrl = new URL('./execution-provider.mjs', import.meta.url);

test('Risk execution provider exposes the qualification trace bridge', async () => {
  const source = await readFile(providerUrl, 'utf8');

  assert.match(source, /const projectRisk = Object\.freeze\(\{/);
  assert.match(source, /linkQualificationTrace\(job, input\)/);
  assert.match(source, /store\.linkRiskQualificationTrace\(job, input\)/);
});

test('Security execution provider exposes identity observation and qualification trace bridges', async () => {
  const source = await readFile(providerUrl, 'utf8');

  assert.match(source, /const security = Object\.freeze\(\{/);
  assert.match(source, /observeIdentity\(job, input\)/);
  assert.match(source, /store\.observeIdentity\(job, input\)/);
  assert.match(source, /getIdentityObservation\(job, observationId\)/);
  assert.match(source, /store\.getIdentityObservation\(job, observationId\)/);
  assert.match(source, /linkQualificationTrace\(job, input\)/);
  assert.match(source, /store\.linkSecurityQualificationTrace\(job, input\)/);
});

