import test from 'node:test';
import assert from 'node:assert/strict';
import {createJarvisLearningReviewHandler} from './jarvis-learning-review.mjs';
import {createSessionToken,SESSION_COOKIE} from '../lib/auth.mjs';
import {createCloudflareApp,DEFAULT_API_HANDLERS} from '../cloudflare-worker.mjs';
const founder='shyamsundhar1982@gmail.com';
const pair=(i=0)=>({sampleId:'sample-'+i,reviewerId:'independent-reviewer',baseline:{subjectId:'baseline',confidence:.9,correct:true,unsupportedClaims:0,latencyMs:100},candidate:{subjectId:'candidate',confidence:.9,correct:true,unsupportedClaims:0,latencyMs:100}});
const batch=()=>({mode:'DECLARED_REVIEW_RESULTS',pairs:Array.from({length:20},(_,i)=>pair(i))});
const app=createCloudflareApp({apiHandlers:{'/api/jarvis-learning-review':createJarvisLearningReviewHandler()},assetFetcher:()=>new Response('',{status:404}),runtimeEnv:{}});
const request=(body,props={})=>new Request('https://vaos.example/api/jarvis-learning-review',{method:'POST',headers:{cookie:`${SESSION_COOKIE}=${createSessionToken(founder)}`,origin:'https://vaos.example','content-type':'application/json'},body:JSON.stringify(body),...props});
test('Worker review computes paired regressions independently of unchanged aggregate accuracy',async()=>{
 assert.equal(typeof DEFAULT_API_HANDLERS['/api/jarvis-learning-review'],'function');
 const b=batch();b.pairs[0].candidate.correct=false;b.pairs[1].baseline.correct=false;
 const r=await app.fetch(request(b));assert.equal(r.status,200);
 const {data}=await r.json();assert.equal(data.regressions,1);assert.equal(data.improvements,1);
 assert.equal(data.baseline.accuracy,data.candidate.accuracy);
 assert.ok(data.holds.includes('PAIRED_REGRESSION_OBSERVED'));
 assert.equal(data.autoPromotionAuthorized,false);assert.equal(data.policyChangesAuthorized,false);
 assert.equal(data.stored,false);assert.equal(data.reviewerIndependenceVerified,false);
 assert.equal(r.headers.get('cache-control'),'no-store');
 assert.doesNotMatch(JSON.stringify(data),/independent-reviewer|sample-0/);
});
test('twenty perfect declared outcomes do not commission learning or founder live acceptance',async()=>{
 const r=await app.fetch(request(batch()));const {data}=await r.json();
 assert.equal(data.candidate.accuracy,1);assert.equal(data.productionAccuracyCertified,false);
 assert.equal(data.operationalOutcomesVerified,false);assert.equal(data.actionAuthorized,false);
 assert.ok(data.holds.includes('LIVE_ACCEPTANCE_REQUIRED'));
});
test('denied sessions, foreign origin and incorrect media cannot review',async()=>{
 assert.equal((await app.fetch(request(batch(),{method:'PUT',body:undefined}))).status,405);
 const withQuery=new Request('https://vaos.example/api/jarvis-learning-review?promote=true',{
  method:'POST',headers:{cookie:`${SESSION_COOKIE}=${createSessionToken(founder)}`,origin:'https://vaos.example','content-type':'application/json'},body:JSON.stringify(batch())});
 assert.equal((await app.fetch(withQuery)).status,422);
 for(const [headers,expected] of [[{},401],[{cookie:`${SESSION_COOKIE}=${createSessionToken('kaaviyam1519@gmail.com')}`},403],
  [{cookie:`${SESSION_COOKIE}=${createSessionToken(founder)}`,origin:'https://other.example'},403],
  [{cookie:`${SESSION_COOKIE}=${createSessionToken(founder)}`,origin:'https://vaos.example','content-type':'text/plain'},415]]){
  assert.equal((await app.fetch(request(batch(),{headers}))).status,expected);
 }
});
test('raw content, self-review, malformed JSON, empty evidence and oversized input fail safely',async()=>{
 for(const b of [{...batch(),question:'private-source'}, {...batch(),pairs:[{...pair(),reviewerId:'candidate'}]},null]){
  const r=await app.fetch(request(b));assert.equal(r.status,422);assert.doesNotMatch(await r.text(),/private-source/);
 }
 assert.equal((await app.fetch(request(batch(),{body:'{bad'}))).status,422);
 assert.equal((await app.fetch(request({question:'a'.repeat(262145)}))).status,413);
 const r=await app.fetch(request({mode:'SYNTHETIC_ONLY',pairs:[]}));const {data}=await r.json();
 assert.equal(data.candidate.accuracy,null);assert.ok(data.holds.includes('EVALUATION_SAMPLE_INSUFFICIENT'));
});

test('explicit founder archive consent persists only aggregate metrics and replays by receipt',async()=>{
 const objects=new Map();
 const bucket={async put(key,value){objects.set(key,value)},async get(key){const value=objects.get(key);return value?{text:async()=>value}:null;}};
 const archiveApp=createCloudflareApp({apiHandlers:{'/api/jarvis-learning-review':createJarvisLearningReviewHandler()},
  assetFetcher:()=>new Response('',{status:404}),runtimeEnv:{VAOS_ARTIFACTS:bucket}});
 const saved=await archiveApp.fetch(request({operation:'SAVE',confirm:true,batch:batch()}));
 assert.equal(saved.status,200);
 const {data}=await saved.json();
 assert.equal(data.stored,true);assert.equal(data.autoPromotionAuthorized,false);
 assert.equal(objects.size,1);
 const stored=[...objects.values()][0];
 assert.doesNotMatch(stored,/independent-reviewer|sampleId|subjectId|sample-0/);
 const replayRequest=new Request('https://vaos.example/api/jarvis-learning-review?receipt='+encodeURIComponent(data.receipt),{
  headers:{cookie:SESSION_COOKIE+'='+createSessionToken(founder)}});
 const replay=await archiveApp.fetch(replayRequest);
 assert.equal(replay.status,200);
 const read=(await replay.json()).data;
 assert.equal(read.sha256,data.sha256);
 assert.equal(read.summary.candidate.sampleCount,20);
 assert.equal(read.learningCertified,false);
 assert.equal(read.modelChanged,false);
 assert.equal(read.policyChangesAuthorized,false);
});
test('archive requests fail closed without storage, consent or a valid receipt',async()=>{
 assert.equal((await app.fetch(request({operation:'SAVE',confirm:true,batch:batch()}))).status,503);
 assert.equal((await app.fetch(request({operation:'SAVE',confirm:false,batch:batch()}))).status,422);
 const invalid=new Request('https://vaos.example/api/jarvis-learning-review?receipt=../secrets',{
  headers:{cookie:SESSION_COOKIE+'='+createSessionToken(founder)}});
 assert.equal((await app.fetch(invalid)).status,422);
 const unknown=new Request('https://vaos.example/api/jarvis-learning-review?receipt=2026-11-18%2F11111111-1111-4111-8111-111111111111',{
  headers:{cookie:SESSION_COOKIE+'='+createSessionToken('kaaviyam1519@gmail.com')}});
 assert.equal((await app.fetch(unknown)).status,403);
});


test('A05 founder POST runs held-out shadow decision with no new storage or model mutation',async()=>{
 const batch100={mode:'DECLARED_REVIEW_RESULTS',pairs:Array.from({length:100},(_,i)=>({
  ...pair(i),
  baseline:{...pair(i).baseline,correct:false,confidence:0.05},
  candidate:{...pair(i).candidate,correct:true,confidence:0.95}
 }))};
 const r=await app.fetch(request(batch100));
 assert.equal(r.status,200);
 const {data}=await r.json(),s=data.a05ShadowReview;
 assert.equal(s.schemaVersion,'VAOS_JARVIS_A05_SHADOW_HOLDOUT_V1');
 assert.equal(s.stage,'A05');assert.equal(s.status,'HOLD');
 assert.equal(s.reversionDecision,'CONTINUE_SHADOW_ONLY');
 assert.ok(s.holdoutSampleCount>=10);
 assert.equal(s.holdoutIndependentlyLocked,false);
 assert.equal(s.autoPromotionAuthorized,false);
 assert.equal(s.liveRollbackExecuted,false);
 assert.equal(s.productionModelChanged,false);
 assert.equal(s.businessActionAuthorized,false);
 assert.equal(data.stored,false);
 assert.doesNotMatch(JSON.stringify(data),/sample-0|independent-reviewer|subjectId/);
});
test('A05 founder POST recommends baseline retention if heldout regressions worsen, without live rollback',async()=>{
 const input={mode:'DECLARED_REVIEW_RESULTS',pairs:Array.from({length:100},(_,i)=>({
  ...pair(i),baseline:{...pair(i).baseline,correct:true,confidence:0.95},
  candidate:{...pair(i).candidate,correct:false,confidence:0.99}
 }))};
 const r=await app.fetch(request(input));assert.equal(r.status,200);
 const s=(await r.json()).data.a05ShadowReview;
 assert.equal(s.reversionDecision,'RETAIN_BASELINE_REVERT_CANDIDATE_IF_ALREADY_TESTING');
 assert.ok(s.holdout.regressions>0);
 assert.equal(s.liveRollbackExecuted,false);
 assert.equal(s.autoRollbackAuthorized,false);
 assert.equal(s.productionWriteAuthorized,false);
});
