// GitHub workflow_dispatch only: real VAOS handlers on an EPHEMERAL hosted Worker.
// Requires narrowly scoped Cloudflare API token. No production bindings or credentials.
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const worker='vaos-stage8-auth-qualification';
const base='https://'+worker+'.vayushastr.workers.dev';
const dir=await mkdtemp(join(tmpdir(),'stage8-hosted-'));
const maker='ST8-'+crypto.randomBytes(32).toString('hex');
const checker='ST8-'+crypto.randomBytes(32).toString('hex');
const hash=p=>crypto.createHash('sha256').update(p).digest('hex');
const vars={STAGE8_ISOLATED_ONLY:'yes',VAOS_AUTH_HARDENED_CONTROL:'dedicated-hmac-v1',
 VAOS_SESSION_HMAC_KEY:crypto.randomBytes(48).toString('hex'),
 VAOS_DEV_LOGIN_PASSWORD_SHA256:hash(maker),VAOS_DEV_CHECKER_PASSWORD_SHA256:hash(checker)};
const configPath=join(dir,'wrangler.json');
const config={name:worker,main:resolve('scripts/qualification/stage8-hosted-auth-fixture.mjs'),
 compatibility_date:'2026-09-28',compatibility_flags:['nodejs_compat'],workers_dev:true,
 vars,r2_buckets:[{binding:'VAOS_ARTIFACTS',bucket_name:'vaos-stage8-qualification-r2'}]};
function wrangler(...args){
 const r=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js',...args],
 {stdio:'pipe',encoding:'utf8',timeout:120000,env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
 if(r.status!==0)throw new Error('WRANGLER_FAILED '+args[0]+' '+(r.stderr||'').slice(-550));
}
async function call(path,options={}){
 return fetch(base+path,{redirect:'manual',...options});
}
async function auth(role,password){
 const r=await call('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},
 body:JSON.stringify({email:role==='maker'?'shyamsundhar1982@gmail.com':'kaaviyam1519@gmail.com',password})});
 assert.equal(r.status,200,role+' hosted login');
 return r.headers.get('set-cookie').split(';')[0];
}
let deployed=false;
try{
 if(!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID)
  throw Error('HOLD_MISSING_CLOUDFLARE_DEPLOY_CREDENTIALS');
 await writeFile(configPath,JSON.stringify(config),{mode:0o600});
 wrangler('deploy','--config',configPath);deployed=true;
 let online=false;
 for(let i=0;i<15;i++){try{const r=await call('/api/session');if(r.status===401){online=true;break;}}catch{}
  await new Promise(ok=>setTimeout(ok,1200));}
 assert.ok(online,'hosted worker reachable');
 const makerCookie=await auth('maker',maker);
 const checkerCookie=await auth('checker',checker);
 assert.notEqual(makerCookie,checkerCookie);
 for(const cookie of [makerCookie,checkerCookie])assert.equal((await call('/api/session',{headers:{cookie}})).status,200);
 assert.equal((await call('/api/logout',{method:'POST',headers:{cookie:checkerCookie}})).status,200);
 assert.equal((await call('/api/session',{headers:{cookie:checkerCookie}})).status,401,'R2 revoked checker cookie');
 assert.equal((await call('/api/session',{headers:{cookie:makerCookie}})).status,200,'maker session remains');
 // Redeploy with IDENTICAL fixture, signing key and bucket; revocation must survive.
 wrangler('deploy','--config',configPath);
 assert.equal((await call('/api/session',{headers:{cookie:checkerCookie}})).status,401,'R2 persistent replay rejection');
 assert.equal((await call('/api/logout',{method:'POST',headers:{cookie:makerCookie}})).status,200);
 assert.equal((await call('/api/session',{headers:{cookie:makerCookie}})).status,401);
 console.log('STAGE8_HOSTED_ACTUAL_HANDLERS_REVOKE_REDEPLOY_PASS');
}finally{
 if(deployed){try{wrangler('delete','--name',worker,'--force');console.log('STAGE8_EPHEMERAL_WORKER_DELETED');}
 catch{console.error('HOLD_EPHEMERAL_WORKER_CLEANUP_REQUIRED');process.exitCode=1;}}
 await rm(dir,{recursive:true,force:true});
}
