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
 for(let attempt=0;attempt<3;attempt++){
 const r=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js',...args],
 {stdio:'pipe',encoding:'utf8',timeout:120000,env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
 if(r.status===0)return;
 const transient=/504 Gateway Timeout|502 Bad Gateway|503 Service Unavailable/.test(r.stderr||'');
 if(transient&&attempt<2){console.log('STAGE8_TRANSIENT_CLOUDFLARE_RETRY',attempt+1);continue;}
 throw new Error('WRANGLER_FAILED '+args[0]+' '+(r.stderr||'').slice(-550));
 }

}
async function call(path,options={}){
 return fetch(base+path,{redirect:'manual',...options});
}
async function auth(role,password){
 let lastStatus=0;
 for(let attempt=0;attempt<20;attempt++){
  const r=await call('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({email:role==='maker'?'shyamsundhar1982@gmail.com':'kaaviyam1519@gmail.com',password})});
  lastStatus=r.status;
  if(r.status===200)return r.headers.get('set-cookie').split(';')[0];
  assert.ok([404,401].includes(r.status),role+' unexpected hosted-login response');
  await new Promise(ok=>setTimeout(ok,1500));
 }
 assert.equal(lastStatus,200,role+' hosted login after bounded propagation');
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
 console.log('STAGE8_MAKER_LOGIN_PASS');
 console.log('STAGE8_CHECKER_LOGIN_PASS');
 // Negative hosted controls: wrong identity/password and forged session rejected.
 const invalidLogin=await call('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({email:'kaaviyam1519@gmail.com',password:maker})});
 assert.equal(invalidLogin.status,401,'role credential isolation');
 console.log('STAGE8_ROLE_SESSION_ISOLATION_PASS');
 const [cookieName,cookieToken]=checkerCookie.split('=');
 const [payload,signature]=cookieToken.split('.');
 const forged=cookieName+'='+payload+'.'+(signature[0]==='a'?'b':'a')+signature.slice(1);
 assert.equal((await call('/api/session',{headers:{cookie:forged}})).status,401,'invalid signature rejected');
 console.log('STAGE8_FORGED_SIGNATURE_REJECTED');
 const expiredPayload=Buffer.from(JSON.stringify({email:'kaaviyam1519@gmail.com',exp:1,v:2,iat:0,
  sid:'0123456789abcdef0123456789abcdef'})).toString('base64url');
 const expiredSignature=crypto.createHmac('sha256',Buffer.from(vars.VAOS_SESSION_HMAC_KEY,'hex'))
  .update(expiredPayload).digest('base64url');
 const expiredCookie='vaos_session='+expiredPayload+'.'+expiredSignature;
 assert.equal((await call('/api/session',{headers:{cookie:expiredCookie}})).status,401,'expired session rejected');
 console.log('STAGE8_EXPIRED_SESSION_REJECTED');
 for(const cookie of [makerCookie,checkerCookie])assert.equal((await call('/api/session',{headers:{cookie}})).status,200);
 assert.equal((await call('/api/logout',{method:'POST',headers:{cookie:checkerCookie}})).status,200);
 assert.equal((await call('/api/session',{headers:{cookie:checkerCookie}})).status,401,'R2 revoked checker cookie');
 assert.equal((await call('/api/session',{headers:{cookie:makerCookie}})).status,200,'maker session remains');
 // Redeploy with IDENTICAL fixture, signing key and bucket; revocation must survive.
 wrangler('deploy','--config',configPath);
 let redeployStable=false;
 for(let attempt=0;attempt<20;attempt++){
  const checkerStatus=(await call('/api/session',{headers:{cookie:checkerCookie}})).status;
  const makerStatus=(await call('/api/session',{headers:{cookie:makerCookie}})).status;
  if(checkerStatus===401&&makerStatus===200){redeployStable=true;break;}
  assert.ok([404,401].includes(checkerStatus),'unexpected checker redeploy response');
  assert.ok([404,200].includes(makerStatus),'unexpected maker redeploy response');
  await new Promise(ok=>setTimeout(ok,1500));
 }
 assert.ok(redeployStable,'identical redeploy must preserve R2 replay denial after bounded propagation');
 assert.equal((await call('/api/logout',{method:'POST',headers:{cookie:makerCookie}})).status,200);
 assert.equal((await call('/api/session',{headers:{cookie:makerCookie}})).status,401);
 // Cutover rehearsal in the isolated Worker: rotate the HMAC key,
 // verify old sessions cannot authenticate, then restore a healthy signer.
 const preRotation=await auth('maker',maker);
 config.vars.VAOS_SESSION_HMAC_KEY=crypto.randomBytes(48).toString('hex');
 await writeFile(configPath,JSON.stringify(config),{mode:0o600});
 wrangler('deploy','--config',configPath);
 let rotated=false;
 for(let attempt=0;attempt<20;attempt++){
  const status=(await call('/api/session',{headers:{cookie:preRotation}})).status;
  if(status===401){rotated=true;break;}
  assert.equal(status,200,'unexpected signer-rotation response');
  await new Promise(ok=>setTimeout(ok,1500));
 }
 assert.ok(rotated,'old token must be rejected after bounded propagation');
 const recovered=await auth('checker',checker);
 assert.equal((await call('/api/session',{headers:{cookie:recovered}})).status,200,
  'recovered isolated authentication');
 // Emergency recovery qualification is isolated to the ephemeral Worker.
 config.vars.VAOS_STAGE8_EMERGENCY_DISABLE='yes';
 await writeFile(configPath,JSON.stringify(config),{mode:0o600});
 wrangler('deploy','--config',configPath);
 let disabled=false;
 for(let attempt=0;attempt<20;attempt++){
  const status=(await call('/api/session')).status;
  if(status===503){disabled=true;break;}
  assert.equal(status,401,'unexpected emergency-disable propagation response');
  await new Promise(ok=>setTimeout(ok,1500));
 }
 assert.ok(disabled,'emergency stop must activate after bounded propagation');
 delete config.vars.VAOS_STAGE8_EMERGENCY_DISABLE;
 await writeFile(configPath,JSON.stringify(config),{mode:0o600});
 wrangler('deploy','--config',configPath);
 let restored=false;
 for(let attempt=0;attempt<20;attempt++){
  const status=(await call('/api/session')).status;
  if(status===401){restored=true;break;}
  assert.equal(status,503,'unexpected emergency-restore response');
  await new Promise(ok=>setTimeout(ok,1500));
 }
 assert.ok(restored,'emergency-stop removal must restore isolated auth after bounded propagation');
 console.log('STAGE8_ISOLATED_EMERGENCY_DISABLE_RESTORE_PASS');
 console.log('STAGE8_HOSTED_ROLLBACK_SIGNER_ROTATION_PASS');
 console.log('STAGE8_HOSTED_ACTUAL_HANDLERS_REVOKE_REDEPLOY_PASS');
}finally{
 if(deployed){
  try{wrangler('delete','--name',worker,'--force');}
  catch{console.warn('STAGE8_WRANGLER_DELETE_NONZERO_VERIFYING_REMOTE_STATE');}
  let absent=false;
  for(let attempt=0;attempt<16;attempt++){
   try{
    const response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+
     encodeURIComponent(process.env.CLOUDFLARE_ACCOUNT_ID)+
     '/workers/scripts/'+encodeURIComponent(worker),{
      headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN}
     });
    const result=await response.json().catch(()=>({}));
    if(response.status===404||result.errors?.some(e=>e.code===10007)){
     absent=true;break;
    }
   }catch{}
   await new Promise(ok=>setTimeout(ok,1500));
  }
  if(absent)console.log('STAGE8_EPHEMERAL_WORKER_DELETED_AND_VERIFIED');
  else{console.error('HOLD_EPHEMERAL_WORKER_CLEANUP_UNVERIFIED');process.exitCode=1;}
 }
 await rm(dir,{recursive:true,force:true});
}
