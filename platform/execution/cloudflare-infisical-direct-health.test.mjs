import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runCloudflareInfisicalHealth,isCloudflareInfisicalHealthEnabled} from './cloudflare-infisical-direct-health.mjs';
const tick=Date.parse('2026-10-09T16:30:00.000Z');
const now=()=>new Date(tick+5000);
const env={INFISICAL_DIRECT_WATCHDOG_ENABLED:'true',INFISICAL_BASE_URL:'https://us.infisical.com',
  INFISICAL_CLIENT_ID:'id',INFISICAL_CLIENT_SECRET:'never-expose',
  INFISICAL_PROJECT_ID:'p',INFISICAL_ENVIRONMENT:'dev',
  INFISICAL_ALLOWED_SECRET_PATH:'/canary',INFISICAL_ALLOWED_SECRET_KEY:'CANARY',
  INFISICAL_DENIED_SECRET_PATH:'/private',INFISICAL_DENIED_SECRET_KEY:'DENIED',
  SUPABASE_URL:'https://vaos.supabase.co',VAOS_INFISICAL_WATCHDOG_KEY:'scoped-writer'};
const reply=(status,body)=>new Response(JSON.stringify(body),{
  status,headers:{'Content-Type':'application/json'}});
function fake({denied=403,ttl=900,db=200}={}){
  const calls=[];
  const fetchImpl=async(url,opts)=>{
    calls.push({url,opts});
    if(url.endsWith('/auth/universal-auth/login'))
      return reply(200,{accessToken:'transient',expiresIn:ttl,accessTokenMaxTTL:ttl,tokenType:'Bearer'});
    if(url.includes('/secrets/CANARY?'))
      return reply(200,{secret:{secretValue:'private-value'}});
    if(url.includes('/secrets/DENIED?'))
      return reply(denied,{secret:{secretValue:'should-never-read'}});
    if(url.endsWith('/functions/v1/vaos-control'))
      return reply(db,{outcome:'SAVED',providerId:'infisical',operation:'record-health',
        qualificationState:'qualified',health:{status:'healthy'},enabled:false});
    throw Error('unexpected URL');
  };
  return {fetchImpl,calls};
}
test('disabled by default and never contacts anything',async()=>{
  const x=fake();assert.equal(isCloudflareInfisicalHealthEnabled({}),false);
  assert.deepEqual(await runCloudflareInfisicalHealth({
    env:{...env,INFISICAL_DIRECT_WATCHDOG_ENABLED:'false'},scheduledTime:tick,fetchImpl:x.fetchImpl,now}),{status:'disabled'});
  assert.equal(x.calls.length,0);
});
test('scoped login, allow, deny, Supabase write without any GitHub request',async()=>{
  const x=fake();
  const result=await runCloudflareInfisicalHealth({env,scheduledTime:tick,fetchImpl:x.fetchImpl,now});
  assert.deepEqual(result,{status:'healthy',scheduledTime:tick,productionActivation:false});
  assert.equal(x.calls.length,4);assert.ok(x.calls.every(c=>c.opts.redirect==='manual'));
  assert.ok(x.calls.every(c=>!c.url.includes('github')));
  assert.equal(x.calls[1].opts.headers.Authorization,'Bearer transient');
  const payload=JSON.parse(x.calls[3].opts.body).payload;
  assert.equal(payload.action,'record-health');
  assert.equal(payload.authorityRef,'cloudflare:vaos:infisical:cron:'+tick);
  assert.equal(payload.health.evidenceRef,payload.authorityRef);
  assert.equal(x.calls[3].opts.headers['x-vaos-server-key'],'scoped-writer');
  assert.equal(JSON.stringify(result).includes('private-value'),false);
});
test('any required missing credential fails before network',async()=>{
  for(const key of ['INFISICAL_CLIENT_ID','INFISICAL_CLIENT_SECRET',
   'INFISICAL_PROJECT_ID','INFISICAL_ENVIRONMENT','INFISICAL_DENIED_SECRET_KEY',
   'VAOS_INFISICAL_WATCHDOG_KEY']){
    const x=fake();
    await assert.rejects(runCloudflareInfisicalHealth({env:{...env,[key]:''},
      scheduledTime:tick,fetchImpl:x.fetchImpl,now}),/INFISICAL_DIRECT_UNCONFIGURED/);
    assert.equal(x.calls.length,0);
  }
});
test('denied scope readable never writes health',async()=>{
  const x=fake({denied:200});
  await assert.rejects(runCloudflareInfisicalHealth({
    env,scheduledTime:tick,fetchImpl:x.fetchImpl,now}),/INFISICAL_DIRECT_DENIED_SCOPE_UNVERIFIED/);
  assert.equal(x.calls.length,3);
});
test('token TTL outside bound never reads canary',async()=>{
  for(const ttl of [1,7201]){
    const x=fake({ttl});
    await assert.rejects(runCloudflareInfisicalHealth({
      env,scheduledTime:tick,fetchImpl:x.fetchImpl,now}),/INFISICAL_DIRECT_TOKEN_TTL_INVALID/);
    assert.equal(x.calls.length,1);
  }
});
test('unavailable database write never retries',async()=>{
  const x=fake({db:401});
  await assert.rejects(runCloudflareInfisicalHealth({
    env,scheduledTime:tick,fetchImpl:x.fetchImpl,now}),/INFISICAL_DIRECT_HEALTH_WRITE_FAILED/);
  assert.equal(x.calls.length,4);
});
test('untrusted base URL and stale tick fail before outbound request',async()=>{
  for(const base of ['http://us.infisical.com','https://evil.example','https://us.infisical.com.evil.example']){
    const x=fake();
    await assert.rejects(runCloudflareInfisicalHealth({
      env:{...env,INFISICAL_BASE_URL:base},scheduledTime:tick,fetchImpl:x.fetchImpl,now}),
      /INFISICAL_DIRECT_CONFIG_INVALID/);
    assert.equal(x.calls.length,0);
  }
  const x=fake();
  await assert.rejects(runCloudflareInfisicalHealth({
    env,scheduledTime:tick-3600000,fetchImpl:x.fetchImpl,now}),/INFISICAL_DIRECT_TICK_INVALID/);
  assert.equal(x.calls.length,0);
});
test('provider exceptions cannot print or throw bootstrap secret',async()=>{
  await assert.rejects(runCloudflareInfisicalHealth({
    env,scheduledTime:tick,now,
    fetchImpl:async()=>{throw Error('never-expose');}
  }),error=>{assert.equal(error.message,'INFISICAL_DIRECT_AUTH_FAILED');return true;});
});
test('scheduler selects direct or GitHub, leaves missions independent',()=>{
  const source=readFileSync(new URL('../../apps/web/cloudflare-worker.mjs',import.meta.url),'utf8');
  assert.match(source,/isCloudflareInfisicalHealthEnabled\(env\)/);
  assert.match(source,/runCloudflareInfisicalHealth\(\{env,scheduledTime:/);
  assert.match(source,/dispatchInfisicalWatchdog\(/);
  assert.match(source,/Promise\.allSettled\(\[mission,watchdog,synthetic\]\)/);
});

test('migration accepts only bounded Cloudflare health evidence and preserves fail-closed controls',()=>{
  const sql=readFileSync(new URL('../../supabase/migrations/20261009220000_infisical_cloudflare_direct_watchdog_v1.sql',import.meta.url),'utf8');
  assert.match(sql,/cloudflare:vaos:infisical:cron:/);
  assert.match(sql,/p_action <> 'record-health'/);
  assert.match(sql,/interval '25 minutes'/);
  assert.match(sql,/assert_infisical_commissioning_key/);
  assert.match(sql,/INFISICAL_DISABLE_INPUT_INVALID/);
  assert.match(sql,/INFISICAL_HEALTH_TIMESTAMP_INVALID/);
  assert.match(sql,/v_after:=jsonb_set\(v_before,'\{health\}'/);
  assert.match(sql,/UPDATE vaos_private\.provider_control_state/);
  assert.doesNotMatch(sql,/p_action\s*=\s*'enable'/);
});
