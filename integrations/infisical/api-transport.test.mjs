import test from 'node:test';
import assert from 'node:assert/strict';
import { createInfisicalApiTransport } from './api-transport.mjs';

test('Universal Auth uses current v1 login endpoint with JSON body', async()=>{
  const calls=[];
  const transport=createInfisicalApiTransport({
    baseUrl:'https://app.infisical.com',
    httpTransport:{async request(input){
      calls.push(input);
      return {status:200,headers:{},body:{accessToken:'access-token',expiresIn:7200,accessTokenMaxTTL:7200,tokenType:'Bearer'}};
    }},
  });
  const result=await transport.universalLogin({clientId:'client-id',clientSecret:'client-secret'});
  assert.deepEqual(result,{accessToken:'access-token',expiresIn:7200,accessTokenMaxTTL:7200,tokenType:'Bearer'});
  assert.equal(calls[0].url,'https://app.infisical.com/api/v1/auth/universal-auth/login');
  assert.equal(calls[0].method,'POST');
  assert.equal(calls[0].headers['Content-Type'],'application/json');
  assert.deepEqual(JSON.parse(calls[0].body),{clientId:'client-id',clientSecret:'client-secret'});
});

test('secret read uses current v4 endpoint and bearer token', async()=>{
  const calls=[];
  const transport=createInfisicalApiTransport({
    baseUrl:'https://app.infisical.com',
    httpTransport:{async request(input){
      calls.push(input);
      return {status:200,headers:{},body:{secret:{secretKey:'CANARY',secretValue:'top-secret'}}};
    }},
  });
  const result=await transport.readSecret({
    accessToken:'access-token',
    projectId:'project-1',
    environment:'qualification',
    secretPath:'/vaos/allowed',
    secretKey:'CANARY',
  });
  assert.equal(result.secretValue,'top-secret');
  assert.match(calls[0].url,/\/api\/v4\/secrets\/CANARY\?/);
  assert.match(calls[0].url,/projectId=project-1/);
  assert.match(calls[0].url,/environment=qualification/);
  assert.match(calls[0].url,/secretPath=%2Fvaos%2Fallowed/);
  assert.equal(calls[0].headers.Authorization,'Bearer access-token');
});

test('auth, forbidden and missing secret responses are classified without response-body leakage', async()=>{
  for(const [status,code] of [[401,'INFISICAL_AUTH_FAILED'],[403,'INFISICAL_SECRET_FORBIDDEN'],[404,'INFISICAL_SECRET_NOT_FOUND']]){
    const transport=createInfisicalApiTransport({
      baseUrl:'https://app.infisical.com',
      httpTransport:{async request(){return{status,headers:{},body:{message:'Bearer leaked-secret'}}}},
    });
    await assert.rejects(async()=>{try{
      if(status===401)await transport.universalLogin({clientId:'id',clientSecret:'secret'});
      else await transport.readSecret({accessToken:'token',projectId:'p',environment:'qualification',secretPath:'/x',secretKey:'X'});
    }catch(error){
      assert.equal(error.code,code);
      assert.equal(error.message.includes('leaked-secret'),false);
      throw error;
    }},new RegExp(code));
  }
});

test('base URL must be HTTPS and cannot contain embedded credentials',()=>{
  assert.throws(()=>createInfisicalApiTransport({baseUrl:'http://app.infisical.com',httpTransport:{request(){}}}),/INFISICAL_API_CONFIG_INVALID/);
  assert.throws(()=>createInfisicalApiTransport({baseUrl:'https://user:pass@app.infisical.com',httpTransport:{request(){}}}),/INFISICAL_API_CONFIG_INVALID/);
});

test('authentication failure only exposes safe HTTP status, never response content',async()=>{
  const transport=createInfisicalApiTransport({
    baseUrl:'https://us.infisical.com',
    httpTransport:{async request(){return{status:404,headers:{},body:{message:'private-canary-value'}}}},
  });
  await assert.rejects(async()=>{try{
    await transport.universalLogin({clientId:'id',clientSecret:'private-client-secret'});
  }catch(error){
    assert.equal(error.code,'INFISICAL_AUTH_FAILED');
    assert.equal(error.httpStatus,404);
    assert.equal(error.message.includes('private-canary-value'),false);
    assert.equal(error.message.includes('private-client-secret'),false);
    throw error;
  }},/INFISICAL_AUTH_FAILED/);
});
