import test from 'node:test';
import assert from 'node:assert/strict';
import {createJarvisA06A10DrillHandler} from './jarvis-a06-a10-drill.mjs';
import {createCloudflareApp,DEFAULT_API_HANDLERS} from '../cloudflare-worker.mjs';
import {createSessionToken,SESSION_COOKIE} from '../lib/auth.mjs';
const founder='shyamsundhar1982@gmail.com';
const app=createCloudflareApp({apiHandlers:{'/api/jarvis-a06-a10-drill':createJarvisA06A10DrillHandler()},
 assetFetcher:async()=>new Response('missing',{status:404}),runtimeEnv:{}});
const request=(args={})=>{
 const method=args.method??'POST',headers={'content-type':args.type??'application/json',
  origin:args.origin??'https://vaos.example'};
 if(args.email!==null)headers.cookie=SESSION_COOKIE+'='+createSessionToken(args.email??founder);
 return new Request('https://vaos.example/api/jarvis-a06-a10-drill'+(args.query||''),{
  method,headers,...(method==='POST'?{body:JSON.stringify(args.body??{
   operation:'RUN_OFFLINE_SYNTHETIC_DRILL',confirm:true})}:{})
 });
};
test('A06–A10 route is founder-only, explicitly consented and registered without new provider dependencies',async()=>{
 assert.equal(typeof DEFAULT_API_HANDLERS['/api/jarvis-a06-a10-drill'],'function');
 for(const [args,status] of [
  [{email:null},401],[{email:'other@example.org'},401],
  [{method:'GET'},405],
  [{origin:'https://evil.example.org'},403],
  [{query:'?execute=true'},422],
  [{type:'text/plain'},415],
  [{body:{operation:'RUN_OFFLINE_SYNTHETIC_DRILL',confirm:false}},422],
  [{body:{operation:'START_PRODUCTION_ROLLBACK',confirm:true}},422],
  [{body:{operation:'RUN_OFFLINE_SYNTHETIC_DRILL',confirm:true,write:true}},422]
 ])assert.equal((await app.fetch(request(args))).status,status,JSON.stringify(args));
});
test('A06–A10 route performs all 5 software drills and stays HOLD for production',async()=>{
 const r=await app.fetch(request());
 assert.equal(r.status,200);
 assert.equal(r.headers.get('cache-control'),'no-store');
 const {data}=await r.json();
 assert.equal(data.schemaVersion,'VAOS_JARVIS_A06_A10_OFFLINE_DRILL_V1');
 assert.deepEqual(data.stages.map(x=>x.stage),['A06','A07','A08','A09','A10']);
 assert.equal(data.syntheticOnly,true);
 assert.equal(data.providersInvoked,0);
 assert.equal(data.businessWritesExecuted,0);
 assert.equal(data.productionRecoveryExecuted,false);
 assert.equal(data.independentQualificationCertified,false);
 assert.ok(data.stages.every(x=>x.status==='HOLD'));
});
test('A06–A10 founder UI is visible in unified VAOS workspace and never executes on load',async()=>{
 const {readFile}=await import('node:fs/promises');
 const [html,script,nav]=await Promise.all([
  readFile(new URL('../jarvis-a06-a10.html',import.meta.url),'utf8'),
  readFile(new URL('../jarvis-a06-a10.mjs',import.meta.url),'utf8'),
  readFile(new URL('../vaos-shell.mjs',import.meta.url),'utf8')
 ]);
 assert.match(html,/data-vaos-view="jarvis-a06-a10"/);
 assert.match(html,/data-jarvis-scene/);
 assert.match(html,/src="\/jarvis-a06-a10.mjs"/);
 assert.match(html,/id="a06-a10-confirm"/);
 assert.match(html,/id="a06-a10-run"[^>]*disabled/);
 assert.match(html,/A01 source authority remains HOLD/);
 assert.match(nav,/jarvis-a06-a10.html/);
 assert.match(script,/addEventListener\('click'/);
 assert.doesNotMatch(script,/setInterval\(|setTimeout\(|localStorage|sessionStorage/);
 assert.match(script,/textContent/);
 assert.doesNotMatch(script,/innerHTML/);
});
