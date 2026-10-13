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
 assert.equal((await app.fetch(request(batch(),{method:'GET',body:undefined}))).status,405);
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
