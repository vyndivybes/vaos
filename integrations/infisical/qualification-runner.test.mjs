import test from 'node:test';
import assert from 'node:assert/strict';
import { runInfisicalEphemeralQualification } from './qualification-runner.mjs';

function base(){
  return {
    clientId:'client-id',
    clientSecret:'client-secret',
    allowedProbe:{projectId:'project-1',environment:'qualification',secretPath:'/allowed',secretKey:'CANARY'},
    deniedProbe:{projectId:'project-1',environment:'qualification',secretPath:'/denied',secretKey:'DENIED_CANARY'},
  };
}

test('qualification requires auth, allowed read, denied-scope enforcement and bounded TTL',async()=>{
  const transport={
    async universalLogin(){return{accessToken:'access-token',expiresIn:900,accessTokenMaxTTL:900,tokenType:'Bearer'}},
    async readSecret(input){
      if(input.secretPath==='/denied'){
        const e=new Error('forbidden');e.code='INFISICAL_SECRET_FORBIDDEN';throw e;
      }
      return{secretValue:'qualification-secret'};
    },
  };
  const result=await runInfisicalEphemeralQualification({...base(),transport,minTokenTtlSeconds:60,maxTokenTtlSeconds:1800});
  assert.equal(result.runtimeVersion,'universal-auth-v1+secrets-v4');
  assert.deepEqual(result.checks,[
    {checkId:'universal-auth-login',outcome:'pass'},
    {checkId:'allowed-secret-read',outcome:'pass'},
    {checkId:'denied-scope-read',outcome:'pass'},
    {checkId:'token-ttl-bounded',outcome:'pass'},
  ]);
  const serialized=JSON.stringify(result);
  for(const secret of ['client-secret','access-token','qualification-secret']) assert.equal(serialized.includes(secret),false);
});

test('qualification fails if denied scope can actually read a secret',async()=>{
  const transport={
    async universalLogin(){return{accessToken:'token',expiresIn:900,accessTokenMaxTTL:900,tokenType:'Bearer'}},
    async readSecret(){return{secretValue:'readable'}},
  };
  await assert.rejects(()=>runInfisicalEphemeralQualification({...base(),transport}),/INFISICAL_QUALIFICATION_DENIED_SCOPE_READABLE/);
});

test('qualification fails closed when access-token TTL exceeds policy',async()=>{
  const transport={
    async universalLogin(){return{accessToken:'token',expiresIn:7201,accessTokenMaxTTL:7201,tokenType:'Bearer'}},
    async readSecret(input){
      if(input.secretPath==='/denied'){const e=new Error('not found');e.code='INFISICAL_SECRET_NOT_FOUND';throw e}
      return{secretValue:'ok'};
    },
  };
  await assert.rejects(()=>runInfisicalEphemeralQualification({...base(),transport,maxTokenTtlSeconds:7200}),/INFISICAL_QUALIFICATION_TOKEN_TTL_INVALID/);
});

test('qualification accepts permission-masking 404 for a known denied canary',async()=>{
  const transport={
    async universalLogin(){return{accessToken:'token',expiresIn:600,accessTokenMaxTTL:600,tokenType:'Bearer'}},
    async readSecret(input){
      if(input.secretPath==='/denied'){const e=new Error('missing');e.code='INFISICAL_SECRET_NOT_FOUND';throw e}
      return{secretValue:'ok'};
    },
  };
  const result=await runInfisicalEphemeralQualification({...base(),transport});
  assert.equal(result.checks.find(x=>x.checkId==='denied-scope-read').outcome,'pass');
});

test('raw transport errors are converted to safe qualification codes',async()=>{
  const transport={async universalLogin(){throw new Error('Bearer secret-token connection failed')},async readSecret(){}};
  await assert.rejects(async()=>{try{await runInfisicalEphemeralQualification({...base(),transport})}catch(error){
    assert.equal(error.code,'INFISICAL_QUALIFICATION_AUTH_FAILED');
    assert.equal(error.message.includes('secret-token'),false);
    throw error;
  }},/INFISICAL_QUALIFICATION_AUTH_FAILED/);
});

test('qualification probes a distinct denied project without leaking denied values',async()=>{
  const calls=[];
  const transport={
    async universalLogin(){return{accessToken:'token',expiresIn:900,accessTokenMaxTTL:900,tokenType:'Bearer'}},
    async readSecret(input){
      calls.push({projectId:input.projectId,secretPath:input.secretPath});
      if(input.projectId==='deny-project'){
        const e=new Error('forbidden');e.code='INFISICAL_SECRET_FORBIDDEN';throw e;
      }
      return{secretValue:'allowed-canary'};
    },
  };
  const result=await runInfisicalEphemeralQualification({
    ...base(),transport,
    allowedProbe:{projectId:'allow-project',environment:'dev',secretPath:'/vaos/allowed',secretKey:'CANARY'},
    deniedProbe:{projectId:'deny-project',environment:'dev',secretPath:'/vaos/denied',secretKey:'DENIED_CANARY'},
  });
  assert.equal(result.checks.find(c=>c.checkId==='denied-scope-read').outcome,'pass');
  assert.deepEqual(calls,[
    {projectId:'allow-project',secretPath:'/vaos/allowed'},
    {projectId:'deny-project',secretPath:'/vaos/denied'},
  ]);
  assert.equal(JSON.stringify(result).includes('allowed-canary'),false);
});

test('qualification rejects a denied project when same identity can read its canary',async()=>{
  const transport={
    async universalLogin(){return{accessToken:'token',expiresIn:900,accessTokenMaxTTL:900,tokenType:'Bearer'}},
    async readSecret(){return{secretValue:'unexpectedly readable'}},
  };
  await assert.rejects(()=>runInfisicalEphemeralQualification({
    ...base(),transport,deniedProbe:{projectId:'deny-project',environment:'dev',secretPath:'/vaos/denied',secretKey:'DENIED_CANARY'},
  }),/INFISICAL_QUALIFICATION_DENIED_SCOPE_READABLE/);
});

test('qualification reports an HTTP 404 category without leaking auth data',async()=>{
  const transport={
    async universalLogin(){const e=new Error('sensitive-key-should-not-leak');e.code='INFISICAL_AUTH_FAILED';e.httpStatus=404;throw e},
    async readSecret(){throw new Error('should not get here')},
  };
  await assert.rejects(async()=>{
    try{await runInfisicalEphemeralQualification({...base(),transport})}
    catch(error){
      assert.equal(error.code,'INFISICAL_QUALIFICATION_AUTH_FAILED');
      assert.equal(error.message,'INFISICAL_QUALIFICATION_AUTH_FAILED:HTTP_404');
      assert.equal(error.message.includes('sensitive-key-should-not-leak'),false);
      throw error;
    }
  },/INFISICAL_QUALIFICATION_AUTH_FAILED:HTTP_404/);
});
