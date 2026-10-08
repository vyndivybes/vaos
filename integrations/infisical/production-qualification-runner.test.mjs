import test from 'node:test';
import assert from 'node:assert/strict';
import { runInfisicalProductionQualification } from './production-qualification-runner.mjs';

function probe(){
  return {projectId:'project-1',environment:'qualification',secretPath:'/allowed',secretKey:'CANARY'};
}

test('production qualification proves rotated credential works, old credential is revoked, and rollback disables routing',async()=>{
  const transport={
    async universalLogin({clientSecret}){
      if(clientSecret==='old-revoked'){const e=new Error('unauthorized');e.code='INFISICAL_AUTH_FAILED';throw e}
      return{accessToken:'new-token',expiresIn:900,accessTokenMaxTTL:900,tokenType:'Bearer'};
    },
    async readSecret(){return{secretValue:'canary-secret'}},
  };
  let enabled=true;
  const controlPlane={
    async setProviderEnabled({enabled:value}){enabled=value},
    resolve(){return enabled?{providerId:'infisical'}:null},
  };
  const result=await runInfisicalProductionQualification({
    transport,clientId:'client-id',currentClientSecret:'new-secret',revokedClientSecret:'old-revoked',
    allowedProbe:probe(),controlPlane,
  });
  assert.deepEqual(result.checks,[
    {checkId:'bootstrap-credential-rotation',outcome:'pass'},
    {checkId:'rollback-drill',outcome:'pass'},
  ]);
  assert.equal(enabled,false);
  const serialized=JSON.stringify(result);
  for(const secret of ['new-secret','old-revoked','new-token','canary-secret'])assert.equal(serialized.includes(secret),false);
});

test('production qualification fails if revoked credential still authenticates',async()=>{
  const transport={
    async universalLogin(){return{accessToken:'token',expiresIn:900,tokenType:'Bearer'}},
    async readSecret(){return{secretValue:'x'}},
  };
  await assert.rejects(()=>runInfisicalProductionQualification({
    transport,clientId:'id',currentClientSecret:'new',revokedClientSecret:'old',
    allowedProbe:probe(),controlPlane:{async setProviderEnabled(){},resolve(){return null}},
  }),/INFISICAL_PRODUCTION_REVOKED_CREDENTIAL_STILL_VALID/);
});

test('production qualification fails if rotated credential cannot read allowed canary',async()=>{
  const transport={
    async universalLogin({clientSecret}){if(clientSecret==='old'){const e=new Error('unauthorized');e.code='INFISICAL_AUTH_FAILED';throw e}return{accessToken:'token',expiresIn:900,tokenType:'Bearer'}},
    async readSecret(){throw new Error('read failed')},
  };
  await assert.rejects(()=>runInfisicalProductionQualification({
    transport,clientId:'id',currentClientSecret:'new',revokedClientSecret:'old',
    allowedProbe:probe(),controlPlane:{async setProviderEnabled(){},resolve(){return null}},
  }),/INFISICAL_PRODUCTION_ROTATED_CREDENTIAL_FAILED/);
});

test('rollback drill fails if routing remains available after disable',async()=>{
  const transport={
    async universalLogin({clientSecret}){if(clientSecret==='old'){const e=new Error('unauthorized');e.code='INFISICAL_AUTH_FAILED';throw e}return{accessToken:'token',expiresIn:900,tokenType:'Bearer'}},
    async readSecret(){return{secretValue:'x'}},
  };
  await assert.rejects(()=>runInfisicalProductionQualification({
    transport,clientId:'id',currentClientSecret:'new',revokedClientSecret:'old',
    allowedProbe:probe(),controlPlane:{async setProviderEnabled(){},resolve(){return{providerId:'infisical'}}},
  }),/INFISICAL_PRODUCTION_ROLLBACK_FAILED/);
});

test('production qualification fails closed when next and revoked credentials are identical',async()=>{
  let authCalls=0;
  const transport={async universalLogin(){authCalls++;return{accessToken:'token'}},async readSecret(){return{secretValue:'x'}}};
  await assert.rejects(()=>runInfisicalProductionQualification({
    transport,clientId:'client-id',currentClientSecret:'same-secret',revokedClientSecret:'same-secret',
    allowedProbe:probe(),controlPlane:{async setProviderEnabled(){},resolve(){return null}},
  }),/INFISICAL_PRODUCTION_CREDENTIALS_NOT_ROTATED/);
  assert.equal(authCalls,0);
});
