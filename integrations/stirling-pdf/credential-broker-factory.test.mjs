import test from 'node:test';
import assert from 'node:assert/strict';
import { createStirlingCredentialBroker, STIRLING_SECRET_BINDING_REF } from './credential-broker-factory.mjs';

test('rejects missing Stirling credentials', () => {
  assert.throws(() => createStirlingCredentialBroker({env:{}}), {code:'STIRLING_INFISICAL_CONFIG_MISSING'});
});

test('retrieves only the scoped Stirling key', async () => {
  const calls = [];
  const broker = createStirlingCredentialBroker({
    env: {
      STIRLING_INFISICAL_CLIENT_ID:'id',
      STIRLING_INFISICAL_CLIENT_SECRET:'secret',
      STIRLING_INFISICAL_PROJECT_ID:'project',
    },
    httpTransport:{request:async request => {
      calls.push(request);
      if(request.method==='POST')return {status:200,body:{accessToken:'token',expiresIn:3600}};
      return {status:200,body:{secret:{secretValue:'key'}}};
    }},
  });
  const request = {bindingRef:STIRLING_SECRET_BINDING_REF,providerId:'stirling-pdf',capability:'document.transform',executionJobId:'job',intentId:'intent'};
  assert.equal(await broker.withCredential(request, async credential => credential.value),'key');
  assert.equal(calls.length,2);
  assert.equal(new URL(calls[1].url).searchParams.get('projectId'),'project');
  await assert.rejects(broker.withCredential({...request,providerId:'wrong'}, async()=>{}),{code:'INFISICAL_BINDING_PROVIDER_MISMATCH'});
});

test('rejects cross-capability access without contacting Infisical', async () => {
  let called = false;
  const broker = createStirlingCredentialBroker({
    env: {
      STIRLING_INFISICAL_CLIENT_ID:'id',
      STIRLING_INFISICAL_CLIENT_SECRET:'secret',
      STIRLING_INFISICAL_PROJECT_ID:'project',
    },
    httpTransport:{request:async () => { called=true; throw Error('unexpected network'); }},
  });
  await assert.rejects(
    broker.withCredential({
      bindingRef:STIRLING_SECRET_BINDING_REF,
      providerId:'stirling-pdf',
      capability:'workflow.execute',
      executionJobId:'job',
      intentId:'intent',
    },async()=>{}),
    {code:'INFISICAL_BINDING_CAPABILITY_MISMATCH'},
  );
  assert.equal(called,false);
});
