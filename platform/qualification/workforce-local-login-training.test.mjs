import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {sha256,createSessionToken,SESSION_COOKIE} from '../../apps/web/lib/auth.mjs';
import {startLocalTrainingServer} from './workforce-local-training-server.mjs';
import {ROLE_EXERCISES} from './workforce-training-fixtures.mjs';
const keys=['VAOS_AUTH_HARDENED_CONTROL','VAOS_SESSION_HMAC_KEY','VAOS_DEV_LOGIN_PASSWORD_SHA256','VAOS_DEV_CHECKER_PASSWORD_SHA256'];

test('loopback login → 16-role exercise events → SQL output → restored report, with authorization and input negatives',async()=>{
 const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 const password=randomBytes(32).toString('hex'),checkerPassword=randomBytes(32).toString('hex');
 Object.assign(process.env,{VAOS_AUTH_HARDENED_CONTROL:'dedicated-hmac-v1',VAOS_SESSION_HMAC_KEY:randomBytes(32).toString('hex'),VAOS_DEV_LOGIN_PASSWORD_SHA256:sha256(password),VAOS_DEV_CHECKER_PASSWORD_SHA256:sha256(checkerPassword)});
 let db=new PGlite(),server,restored,second;
 try{
  server=await startLocalTrainingServer(db);
  const post=(path,body,cookie='',extra={})=>fetch(server.origin+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:server.origin,Cookie:cookie,'X-VAOS-Training':'synthetic-only',...extra},body:JSON.stringify(body)});
  const login=await post('/training/login',{email:'shyamsundhar1982@gmail.com',password});
  assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
  assert.equal((await post('/training/login',{email:'shyamsundhar1982@gmail.com',password:'wrong'})).status,401);
  assert.equal((await fetch(server.origin+'/training/results')).status,401);
  const checkerLogin=await post('/training/login',{email:'kaaviyam1519@gmail.com',password:checkerPassword});
  assert.equal(checkerLogin.status,200);
  assert.equal((await fetch(server.origin+'/training/results',{headers:{Cookie:checkerLogin.headers.get('set-cookie').split(';')[0]}})).status,403);
  const expired=createSessionToken('shyamsundhar1982@gmail.com',1,Date.now()-10000);
  assert.equal((await fetch(server.origin+'/training/results',{headers:{Cookie:SESSION_COOKIE+'='+expired}})).status,401);
  for(const employeeId of Object.keys(ROLE_EXERCISES))for(const variant of ['good','bad']){
   const event={employeeId,variant,eventId:'TRAINING-'+employeeId.toUpperCase()+'-'+variant.toUpperCase()};
   const response=await post('/training/run',event,cookie);assert.equal(response.status,200);
   const data=await response.json();assert.equal(data.replayed,false);
   assert.deepEqual(data.output.findings,variant==='good'?[]:ROLE_EXERCISES[employeeId].expected);
   assert.equal(data.output.qualificationGranted,false);
   const duplicate=await post('/training/run',event,cookie);assert.equal((await duplicate.json()).replayed,true);
   assert.equal((await post('/training/run',{...event,variant:variant==='good'?'bad':'good'},cookie)).status,409);
  }
  const event={employeeId:'finance',variant:'good',eventId:'TRAINING-NEW'};
  assert.equal((await post('/training/run',event,cookie,{Origin:'https://outside.invalid'})).status,403);
  assert.equal((await post('/training/run',event,cookie,{'X-VAOS-Training':''})).status,403);
  assert.equal((await post('/training/run',{...event,production:true},cookie)).status,422);
  assert.equal((await post('/training/run',{...event,employeeId:'__proto__'},cookie)).status,422);
  assert.equal((await fetch(server.origin+'/api/intents',{method:'POST',headers:{Origin:server.origin,'Content-Type':'application/json',Cookie:cookie},body:'{}'})).status,404);
  const rows=(await (await fetch(server.origin+'/training/results',{headers:{Cookie:cookie}})).json()).rows;
  assert.equal(rows.length,32);
  await server.close();server=null;
  const dump=await db.dumpDataDir('none');await db.close();db=null;
  restored=new PGlite({loadDataDir:dump});second=await startLocalTrainingServer(restored);
  const restoredLogin=await fetch(second.origin+'/training/login',{method:'POST',headers:{Origin:second.origin,'Content-Type':'application/json'},body:JSON.stringify({email:'shyamsundhar1982@gmail.com',password})});
  assert.equal(restoredLogin.status,200);
  const read=await fetch(second.origin+'/training/results',{headers:{Cookie:restoredLogin.headers.get('set-cookie').split(';')[0]}});
  assert.equal(read.status,200);assert.deepEqual((await read.json()).rows,rows);
 }finally{
  if(server)await server.close();if(second)await second.close();if(db)await db.close();if(restored)await restored.close();
  for(const k of keys){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}
 }
});
