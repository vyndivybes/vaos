import test from 'node:test';
import assert from 'node:assert/strict';
import { createInfisicalSecretResolver } from './secret-resolver.mjs';

function config(overrides={}) {
  return {
    bindings:{
      'secret:n8n:api':{
        projectId:'project-1',environment:'prod',secretPath:'/providers/n8n',secretKey:'N8N_API_KEY',
        providerId:'n8n',capabilities:['workflow.orchestrate'],kind:'api-key',
      },
    },
    leaseTtlSeconds:900,
    ...overrides,
  };
}

test('Infisical resolver exchanges bootstrap identity for token and fetches only mapped secret', async()=>{
  const calls=[];
  const resolver=createInfisicalSecretResolver({
    bootstrapIdentity:async()=>({clientId:'client-id',clientSecret:'client-secret'}),
    transport:{
      async universalLogin(input){calls.push({op:'login',input});return{accessToken:'access-token',expiresIn:7200}},
      async readSecret(input){calls.push({op:'read',input});return{secretValue:'provider-secret'}},
    },
    config:config(),
    now:()=>new Date('2026-10-08T00:00:00.000Z'),
  });

  const credential=await resolver({
    bindingRef:'secret:n8n:api',
    providerId:'n8n',
    capability:'workflow.orchestrate',
    executionJobId:'job-1',
    intentId:'intent-1',
  });

  assert.equal(credential.kind,'api-key');
  assert.equal(credential.value,'provider-secret');
  assert.equal(credential.providerId,'n8n');
  assert.deepEqual(credential.capabilities,['workflow.orchestrate']);
  assert.equal(credential.expiresAt,'2026-10-08T00:15:00.000Z');
  assert.equal(calls[1].input.projectId,'project-1');
  assert.equal(calls[1].input.secretPath,'/providers/n8n');
  assert.equal(calls[1].input.secretKey,'N8N_API_KEY');
});

test('unknown binding fails before bootstrap identity or network access', async()=>{
  let touched=false;
  const resolver=createInfisicalSecretResolver({
    bootstrapIdentity:async()=>{touched=true;return{}},
    transport:{async universalLogin(){touched=true},async readSecret(){touched=true}},
    config:config(),
  });
  await assert.rejects(()=>resolver({
    bindingRef:'secret:unknown',providerId:'n8n',capability:'workflow.orchestrate',
    executionJobId:'job-1',intentId:'intent-1',
  }),/INFISICAL_BINDING_NOT_FOUND/);
  assert.equal(touched,false);
});

test('binding scope prevents provider or capability escalation', async()=>{
  let touched=false;
  const resolver=createInfisicalSecretResolver({
    bootstrapIdentity:async()=>{touched=true;return{}},
    transport:{async universalLogin(){touched=true},async readSecret(){touched=true}},
    config:config(),
  });

  await assert.rejects(()=>resolver({
    bindingRef:'secret:n8n:api',providerId:'zapier',capability:'workflow.orchestrate',
    executionJobId:'job-1',intentId:'intent-1',
  }),/INFISICAL_BINDING_PROVIDER_MISMATCH/);
  await assert.rejects(()=>resolver({
    bindingRef:'secret:n8n:api',providerId:'n8n',capability:'integration.saas',
    executionJobId:'job-1',intentId:'intent-1',
  }),/INFISICAL_BINDING_CAPABILITY_MISMATCH/);
  assert.equal(touched,false);
});

test('bootstrap/access-token/secret values never enter audit metadata', async()=>{
  const audit=[];
  const resolver=createInfisicalSecretResolver({
    bootstrapIdentity:async()=>({clientId:'client-id-secret',clientSecret:'client-secret-secret'}),
    transport:{
      async universalLogin(){return{accessToken:'access-token-secret',expiresIn:7200}},
      async readSecret(){return{secretValue:'provider-secret'}},
    },
    config:config(),
    recordAudit:async e=>audit.push(e),
  });
  await resolver({
    bindingRef:'secret:n8n:api',providerId:'n8n',capability:'workflow.orchestrate',
    executionJobId:'job-1',intentId:'intent-1',
  });
  const serialized=JSON.stringify(audit);
  for(const secret of ['client-id-secret','client-secret-secret','access-token-secret','provider-secret']){
    assert.equal(serialized.includes(secret),false);
  }
  assert.equal(audit[0].bindingRef,'secret:n8n:api');
});

test('invalid login/read responses fail closed without returning partial credentials', async()=>{
  const base={
    bootstrapIdentity:async()=>({clientId:'id',clientSecret:'secret'}),
    config:config(),
  };
  await assert.rejects(()=>createInfisicalSecretResolver({
    ...base,
    transport:{async universalLogin(){return{}},async readSecret(){return{secretValue:'x'}}},
  })({bindingRef:'secret:n8n:api',providerId:'n8n',capability:'workflow.orchestrate',executionJobId:'j',intentId:'i'}),/INFISICAL_AUTH_FAILED/);

  await assert.rejects(()=>createInfisicalSecretResolver({
    ...base,
    transport:{async universalLogin(){return{accessToken:'token',expiresIn:100}},async readSecret(){return{}}},
  })({bindingRef:'secret:n8n:api',providerId:'n8n',capability:'workflow.orchestrate',executionJobId:'j',intentId:'i'}),/INFISICAL_SECRET_READ_FAILED/);
});
