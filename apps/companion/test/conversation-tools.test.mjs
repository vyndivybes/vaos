import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCompanion} from '../server.mjs';

test('paired conversation creates a document only after exact approval; other origins and bad hashes cannot approve',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'vaos-tools-'));
 const app=await createCompanion({dataDir:dir,python:'not-installed-test-python'});
 const {origin,token}=await app.listen(0);
 const request=(path,method='GET',data,from='https://vaos.vayushastr.workers.dev')=>fetch(origin+path,{method,headers:{Authorization:'Bearer '+token,Origin:from,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});
 try{
  let response=await request('/api/jobs','POST',{kind:'document.create',input:{format:'pdf',title:'Fixture',body:'Reviewed content'},requireReview:true});
  assert.equal(response.status,202);const draft=await response.json();assert.equal(draft.state,'review');
  assert.equal((await (await request('/api/artifacts')).json()).length,0);
  response=await request('/api/jobs/'+draft.id+'/approve','POST',{confirm:'RUN LOCAL ACTION',hash:draft.hash},'https://untrusted.example');assert.equal(response.status,403);
  response=await request('/api/jobs/'+draft.id+'/approve','POST',{confirm:'RUN LOCAL ACTION',hash:'wrong'});assert.equal(response.ok,false);
  response=await request('/api/jobs/'+draft.id+'/approve','POST',{confirm:'RUN LOCAL ACTION',hash:draft.hash});assert.equal(response.ok,true);
  await app.jobs.idle();const completed=await (await request('/api/jobs/'+draft.id)).json();assert.equal(completed.state,'succeeded');
  const file=await request('/api/artifacts/'+completed.result.artifact.id);assert.equal(Buffer.from(await file.arrayBuffer()).subarray(0,4).toString(),'%PDF');
  const desktop=await (await request('/api/jobs','POST',{kind:'desktop.action',input:{action:'open',app:'calculator'}})).json();
  assert.equal(desktop.state,'review');await request('/api/jobs/'+desktop.id+'/stop','POST',{});
  assert.equal((await (await request('/api/jobs/'+desktop.id)).json()).state,'stopped');
 }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
