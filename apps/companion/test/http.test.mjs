import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createCompanion} from '../server.mjs';

test('companion authenticates, isolates origins, reviews skills, denies action routines and revokes pairing',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'vaos-http-'));
 const app=await createCompanion({dataDir:dir,token:'test-token',python:'missing-test-python',run:async()=>({text:'test'})});
 const {origin}=await app.listen(0);
 const request=async(path,method='GET',data,extra={})=>fetch(origin+path,{method,headers:{Authorization:'Bearer test-token','Content-Type':'application/json',...extra},body:data===undefined?undefined:JSON.stringify(data)});
 try{
  assert.equal((await fetch(origin+'/api/status')).status,401);
  assert.equal((await request('/api/status','GET',undefined,{Origin:'https://evil.example'})).status,403);
  assert.equal((await request('/api/status','GET',undefined,{Origin:'https://vaos.vayushastr.workers.dev'})).status,200);
  const preflight=await request('/api/jobs','OPTIONS',undefined,{Origin:'https://vaos.vayushastr.workers.dev'});
  assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),'https://vaos.vayushastr.workers.dev');
  assert.equal((await request('/api/routines','POST',{title:'Bad',kind:'desktop.action',intervalMs:60000,input:{}})).status,400);
  const proposed=await (await request('/api/skills/propose','POST',{name:'upper-case',purpose:'uppercase',tests:[{input:'hello',expected:'HELLO'}]})).json();
  assert.equal(proposed.state,'tested');
  let job=await (await request('/api/jobs','POST',{kind:'skill.run',input:{id:proposed.id,text:'hello'}})).json();
  await app.jobs.idle(); // The test executor is intentionally injected; production approval is checked separately.
  assert.equal((await request('/api/skills/'+proposed.id+'/approve','POST',{hash:'wrong'})).status,400);
  assert.equal((await request('/api/skills/'+proposed.id+'/approve','POST',{hash:proposed.hash})).status,200);
  const failed=await (await request('/api/skills/propose','POST',{name:'wrong-case',purpose:'uppercase',tests:[{input:'hello',expected:'incorrect'}]})).json();
  assert.equal(failed.state,'failed');
  assert.equal((await request('/api/skills/'+failed.id+'/approve','POST',{hash:failed.hash})).status,400);
  assert.equal((await request('/api/artifacts/../../config.json')).status,404);
  await request('/api/revoke','POST',{});
  assert.equal((await request('/api/status')).status,401);
 }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
