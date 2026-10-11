// Run local workerd with R2 storage; no Cloudflare account or production credentials.
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const base='http://127.0.0.1:18789';
const cfg='scripts/qualification/stage8-r2-wrangler.jsonc';
const persist=await mkdtemp(join(tmpdir(),'vaos-stage8-r2-'));
let child;
async function boot(){
 child=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','dev','--local','--config',cfg,'--ip','127.0.0.1','--port','18789','--persist-to',persist],{stdio:['ignore','pipe','pipe'],detached:process.platform!=='win32'});
 let logs='';
 child.stdout.on('data',d=>{logs+=String(d);});child.stderr.on('data',d=>{logs+=String(d);});
 for(let i=0;i<100;i++){
  if(child.exitCode!==null)throw Error('LOCAL_WORKER_EXITED:'+logs.slice(-1000));
  try{const r=await fetch(base+'/api/session');if(r.status===401||r.status===200)return;}catch{}
  await new Promise(ok=>setTimeout(ok,200));
 }
 throw Error('LOCAL_WORKER_START_TIMEOUT:'+logs.slice(-1000));
}
async function stop(){
 if(!child)return;
 const prev=child;child=null;
 if(process.platform!=='win32'){try{process.kill(-prev.pid,'SIGTERM');}catch{prev.kill();}}else prev.kill();
 await Promise.race([new Promise(ok=>prev.once('exit',ok)),new Promise(ok=>setTimeout(ok,3000))]);
 prev.stdout?.destroy();prev.stderr?.destroy();prev.unref();
}
async function req(path,options={}){
 return fetch(base+path,{redirect:'manual',...options});
}
try{
 await boot();
 const login=await req('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'kaaviyam1519@gmail.com',password:'STAGE8_LOCAL_CHECKER_SECRET_NOT_PRODUCTION_20261011'})});
 assert.equal(login.status,200,'checker login in real workerd');
 const cookie=login.headers.get('set-cookie').split(';')[0];
 assert.equal((await req('/api/session',{headers:{cookie}})).status,200);
 const logout=await req('/api/logout',{method:'POST',headers:{cookie}});
 assert.equal(logout.status,200,'logout persisted to local R2');
 assert.equal((await req('/api/session',{headers:{cookie}})).status,401,'copied cookie rejected');
 await stop();
 await boot();
 assert.equal((await req('/api/session',{headers:{cookie}})).status,401,'revocation survives workerd restart');
 console.log('STAGE8_WORKER_R2_PERSISTENT_REVOCATION_PASS');
}finally{await stop();await rm(persist,{recursive:true,force:true});}
