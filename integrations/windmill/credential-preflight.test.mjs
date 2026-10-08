import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyWindmillInfisicalCredential } from './credential-preflight.mjs';

const makeTransport = ({ ttl = 3600, maxTtl = 3600, secret = 'DO-NOT-LOG-WINDMILL-SECRET', deniedCode = 'INFISICAL_SECRET_NOT_FOUND', allowQualification = false } = {}) => ({
  async universalLogin() {
    return { accessToken: 'DO-NOT-LOG-INFISICAL-ACCESS-TOKEN', expiresIn: ttl, accessTokenMaxTTL: maxTtl };
  },
  async readSecret(query) {
    if (query.projectId === 'qualification-project') {
      if (!allowQualification) {
        const error = new Error('denied');
        error.code = deniedCode;
        throw error;
      }
      return { secretValue: 'QUALIFICATION-CANARY' };
    }
    assert.equal(query.projectId, 'windmill-project');
    assert.equal(query.environment, 'prod');
    assert.equal(query.secretPath, '/');
    assert.equal(query.secretKey, 'WINDMILL_API_TOKEN');
    return { secretValue: secret };
  },
});
const input = (transport) => ({
  transport,
  clientId: 'machine-client-id',
  clientSecret: 'DO-NOT-LOG-MACHINE-CLIENT-SECRET',
  projectId: 'windmill-project',
  qualificationProjectId: 'qualification-project',
});

test('verifies production credential presence and denied qualification scope without exposing secrets', async () => {
  const result = await verifyWindmillInfisicalCredential(input(makeTransport()));
  assert.deepEqual(result, {
    status: 'PASS', auth: 'PASS', credentialRead: 'PASS',
    qualificationIsolation: 'PASS', accessTokenTtlSeconds: 3600,
  });
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /DO-NOT-LOG|QUALIFICATION-CANARY/);
});

test('rejects a missing or empty production token', async () => {
  await assert.rejects(verifyWindmillInfisicalCredential(input(makeTransport({ secret: '' }))), { code: 'WINDMILL_CREDENTIAL_MISSING' });
});

test('rejects excessively long access-token lifetimes', async () => {
  await assert.rejects(verifyWindmillInfisicalCredential(input(makeTransport({ ttl: 7201 }))), { code: 'WINDMILL_INFISICAL_TTL_UNSAFE' });
  await assert.rejects(verifyWindmillInfisicalCredential(input(makeTransport({ maxTtl: 7201 }))), { code: 'WINDMILL_INFISICAL_TTL_UNSAFE' });
});

test('rejects project identities that can read the qualification canary', async () => {
  await assert.rejects(verifyWindmillInfisicalCredential(input(makeTransport({ allowQualification: true }))), { code: 'WINDMILL_INFISICAL_ISOLATION_FAILED' });
});

test('rejects errors other than explicit permission denial for qualification scope', async () => {
  await assert.rejects(verifyWindmillInfisicalCredential(input(makeTransport({ deniedCode: 'INFISICAL_UNAVAILABLE' }))), { code: 'WINDMILL_INFISICAL_ISOLATION_UNVERIFIED' });
});

test('rejects reuse of the qualification project as a production secret store', async () => {
  await assert.rejects(verifyWindmillInfisicalCredential({
    ...input(makeTransport()), projectId: 'qualification-project',
  }), { code: 'WINDMILL_INFISICAL_PROJECT_NOT_ISOLATED' });
});
