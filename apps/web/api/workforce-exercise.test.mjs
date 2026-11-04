import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSessionToken,SESSION_COOKIE} from '../lib/auth.mjs';
import {createWorkforceExerciseHandler} from './workforce-exercise.mjs';
import {EXERCISE_ORDER} from '../../../platform/qualification/workforce-exercise-cases.mjs';

// A real disposable SQLite journal verifies restart/uncertain-write behavior.
// This adapter is test-only; it is not a substitute for hosted PostgreSQL proof.
function journal(path){
 const db=new DatabaseSync(path);db.exec('create table if not exists runs(id text primary key, actor text, hash text, output text)');
 let failAfterCommit=false,corruptRead=false;
 return {close:()=>db.close(),interrupt:()=>{failAfterCommit=true;},corrupt:()=>{corruptRead=true;},
 async prelaunchOutput(x){
  if(x.requestId){
   db.prepare('insert or ignore into runs values(?,?,?,?)').run(x.requestId,x.actorEmail,x.requestHash,JSON.stringify(x.output));
   const r=db.prepare('select * from runs where id=?').get(x.requestId);
   if(r.actor!==x.actorEmail||r.hash!==x.requestHash)throw Error('IDEMPOTENCY_CONFLICT');
   if(failAfterCommit){failAfterCommit=false;throw Error('INTERRUPTION_AFTER_COMMIT');}
   return {data:corruptRead?{...JSON.parse(r.output),businessEffectsExecuted:true}:reorder(JSON.parse(r.output))};
  }
  if(corruptRead)return {runs:[]};
  return {runs:db.prepare('select output from runs where actor=? order by rowid desc limit 10').all(x.actorEmail).map(r=>JSON.parse(r.output))};
 }};
}
// PostgreSQL jsonb readback may reorder object keys; semantic equality must
// survive that without accepting altered arrays, findings or source hashes.
function reorder(x){return Array.isArray(x)?x.map(reorder):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).reverse().map(([k,v])=>[k,reorder(v)])):x;}
async function serve(store){
 const handler=createWorkforceExerciseHandler({getStore:()=>store});
 const server=createServer(async(req,res)=>{
  let raw='';for await(const c of req)raw+=c;
  const body=raw?JSON.parse(raw):undefined;
  const response={setHeader:(k,v)=>res.setHeader(k,v),status(n){res.statusCode=n;return this;},json(j){res.end(JSON.stringify(j));}};
  await handler({method:req.method,url:'http://'+req.headers.host+req.url,headers:req.headers,body,env:{}},response);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 return {origin,close:()=>new Promise(resolve=>server.close(resolve)),async call(body,{email='shyamsundhar1982@gmail.com',originHeader=origin,cookie,method=body?'POST':'GET',contentType='application/json'}={}){
  const r=await fetch(origin+'/api/workforce-exercise',{method,headers:{origin:originHeader,'content-type':contentType,cookie:cookie??(email?SESSION_COOKIE+'='+createSessionToken(email):'')},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json()};
 }};
}
test('authenticated isolated HTTP exercises persist, restart, replay and reject mismatched evidence',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'vaos-role-'));let store=journal(join(dir,'journal.db')),server=await serve(store);
 try{
  assert.equal((await server.call(undefined,{email:''})).status,401);
  assert.equal((await server.call(undefined,{email:'kaaviyam1519@gmail.com'})).status,403);
  assert.equal((await server.call(undefined,{cookie:'vaos_session=%ZZ'})).status,401);
  const manifest=await server.call();assert.equal(manifest.status,200);assert.deepEqual(manifest.body.data.order,EXERCISE_ORDER);
  const body={requestId:crypto.randomUUID(),employeeId:'security',variant:'challenge'};
  assert.equal((await server.call(body,{originHeader:'https://evil.example'})).status,403);
  assert.equal((await server.call(body,{contentType:'text/plain'})).status,415);
  assert.equal((await server.call({...body,execute:true})).status,422);
  assert.equal((await server.call({...body,employeeId:'finance',source:{}})).status,422);
  assert.equal((await server.call(undefined,{method:'DELETE'})).status,405);
  store.interrupt();const interrupted=await server.call(body);assert.equal(interrupted.status,503);assert.equal(interrupted.body.error.retryWithSameRequestId,true);
  await server.close();store.close();store=journal(join(dir,'journal.db'));server=await serve(store);
  const recovered=await server.call(body);assert.equal(recovered.status,200);assert.equal(recovered.body.data.persistenceVerified,true);
  assert.equal(recovered.body.data.outputs[0].decision,'DENY');assert.equal(recovered.body.data.qualificationGranted,false);
  const replay=await server.call(body);assert.deepEqual(replay.body,recovered.body);
  assert.equal((await server.call({...body,variant:'corrected'})).status,503);
  for(const employeeId of EXERCISE_ORDER){
   for(const variant of ['challenge','corrected']){
    const r=await server.call({requestId:crypto.randomUUID(),employeeId,variant});
    assert.equal(r.status,200,employeeId+':'+variant);assert.equal(r.body.data.outputs[0].employeeId,employeeId);
   }
  }
  assert.equal((await server.call(body)).status,200,'old receipt remains recoverable beyond ten-item history window');
  store.corrupt();assert.equal((await server.call({requestId:crypto.randomUUID(),employeeId:'orchestrator',variant:'corrected'})).status,503);
 }finally{await server.close();store.close();await rm(dir,{recursive:true,force:true});}
});
