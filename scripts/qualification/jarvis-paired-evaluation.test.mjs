import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {runEvaluationFile} from './jarvis-paired-evaluation.mjs';
test('CLI consumes local JSON and emits aggregate metrics without reviewer or source text',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'jarvis-eval-'));
 try{
  const path=join(dir,'input.json');
  await writeFile(path,JSON.stringify({mode:'SYNTHETIC_ONLY',pairs:[]}));
  const result=spawnSync(process.execPath,['scripts/qualification/jarvis-paired-evaluation.mjs',path],{encoding:'utf8'});
  assert.equal(result.status,0);const r=JSON.parse(result.stdout);
  assert.equal(r.status,'DESCRIPTIVE_METRICS_ONLY');assert.equal(r.candidate.accuracy,null);
  await writeFile(path,'{"private-secret":');
  const fail=spawnSync(process.execPath,['scripts/qualification/jarvis-paired-evaluation.mjs',path],{encoding:'utf8'});
  assert.equal(fail.status,1);assert.doesNotMatch(fail.stdout+fail.stderr,/private-secret/);
  await assert.rejects(()=>runEvaluationFile(dir),/FILE_INVALID/);
  await writeFile(path,'x'.repeat(2*1024*1024+1));
  await assert.rejects(()=>runEvaluationFile(path),/FILE_INVALID/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
