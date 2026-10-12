import test from 'node:test';import assert from 'node:assert/strict';
import {createSessionToken,SESSION_COOKIE} from '../lib/auth.mjs';
import {createVoiceEvidenceAiHandler,validateGroundedDraft,validateGroundedProse} from './voice-evidence-ai.mjs';
import {DEFAULT_API_HANDLERS} from '../cloudflare-worker.mjs';
function res(){const state={status:200,body:null};const r={setHeader(){return r},status(n){state.status=n;return r},json(b){state.body=b;return r}};return {state,r};}
function req({email='shyamsundhar1982@gmail.com',flag='founder-readonly-pilot-v1',method='POST',origin='https://vaos.test',body={question:'carbon frame engineering risks'}}={}){return {method,url:'https://vaos.test/api/voice-evidence-ai',headers:{cookie:email?SESSION_COOKIE+'='+createSessionToken(email):'',origin,'content-type':'application/json'},body,env:{VAOS_VOICE_EVIDENCE_AI_CONTROL:flag,VAOS_FEDERATED_KNOWLEDGE_CONTROL:'founder-readonly-v1',VAOS_FEDERATED_GITHUB_TOKEN:'012345678901234567890123456789',AI:{run:async()=>({})},VAOS_ARTIFACTS:{}}};}
test('registered gated route denies unauthorized without provider access',async()=>{
 assert.equal(typeof DEFAULT_API_HANDLERS['/api/voice-evidence-ai'],'function');
 let calls=0;const h=createVoiceEvidenceAiHandler({fetchImpl:async()=>{calls++},claim:async()=>{calls++}});
 for(const opts of [{email:''},{email:'stranger@example.com'},{flag:'off'},{method:'GET'},{origin:'https://other.test'},{body:{question:'send secret token'}}]){
  const {state,r}=res();await h(req(opts),r);assert.notEqual(state.status,200);
 }
 assert.equal(calls,0);
});
test('strict model output validates citation indices and disallows authority claims',()=>{
 const sources=[{excerpt:'Carbon frame material review open'}];
 const good={response:JSON.stringify({analysis:'Material test results are not established.',recommendation:'Review test certificates and verify production gate.',citations:[1]})};
 assert.match(validateGroundedDraft(good,sources).answer,/Unverified AI analysis/);
 assert.throws(()=>validateGroundedDraft({response:JSON.stringify({analysis:'Production approved',recommendation:'Proceed to build',citations:[1]})},sources));
 assert.throws(()=>validateGroundedDraft({response:JSON.stringify({analysis:'Material test results are not established.',recommendation:'Review test certificates and verify production gate.',citations:[2]})},sources));
 assert.throws(()=>validateGroundedDraft({response:'invalid'},sources));
});

test('natural question ending in question mark reaches evidence search instead of 422',async()=>{let invoked=0;const h=createVoiceEvidenceAiHandler({fetchImpl:async()=>{invoked++;return {ok:false,status:401}},claim:async()=>({allowed:true,remaining:2})});const {state,r}=res();await h(req({body:{question:'What are our carbon frame engineering risks?'}}),r);assert.notEqual(state.status,422);assert.ok(invoked>0);});

test('Cloudflare nested response and fenced JSON are accepted without weakening evidence validation',()=>{
 const x={analysis:'Available evidence indicates unresolved verification.',recommendation:'Review validation records and confirm owners.',citations:[1]};
 const sources=[{excerpt:'Validation records pending'}];
 assert.match(validateGroundedDraft({result:{response:'\`\`\`json\n'+JSON.stringify(x)+'\n\`\`\`'}},sources).answer,/advisory/);
 assert.throws(()=>validateGroundedDraft({response:JSON.stringify({...x,citations:[2]})},sources));
});

test('invalid hosted AI response produces clearly unqualified sourced fallback',async()=>{
 const {state,r}=res();
 const fetchImpl=async url=>({ok:true,json:async()=>url.includes('/search/code?')?{items:[]}:url.includes('/git/trees/')?{tree:[{type:'blob',path:'docs/carbon-frame.md',size:50,sha:'a'.repeat(40)}]}:url.includes('/contents/')?{encoding:'base64',size:50,content:btoa('Carbon frame risks require additional verification.')}: {default_branch:'main'}});
 const handler=createVoiceEvidenceAiHandler({fetchImpl,claim:async()=>({allowed:true,remaining:1}),run:async()=>({response:'not JSON'})});
 await handler(req(),r);
 assert.equal(state.status,200);
 assert.equal(state.body.data.mode,'DETERMINISTIC_FALLBACK_AI_UNVERIFIED');
 assert.equal(state.body.data.modelInvoked,false);
 assert.equal(state.body.data.aiQualification,'HOLD');
 assert.equal(state.body.data.actionAuthorized,false);
});

test('Workers AI structured object response passes strict advisory validation',()=>{
 const source=[{excerpt:'Carbon frame engineering tests pending'}];
 const response={response:{analysis:'Evidence suggests engineering testing is still pending.',recommendation:'Review the material test matrix before accepting a release.',citations:[1]}};
 assert.match(validateGroundedDraft(response,source).answer,/Unverified AI analysis/);
 assert.throws(()=>validateGroundedDraft({response:{...response.response,citations:[2]}},source));
});

test('natural prose response produces unverified advisory with deterministic citations',()=>{
 const sources=[{excerpt:'Carbon frame prototype requires testing.'}];
 const valid=validateGroundedProse({response:'The prototype may require further structural testing before a release decision.'},sources);
 assert.match(valid.answer,/Unverified model-generated advisory/);
 assert.deepEqual(valid.citationIndices,[1]);
 assert.throws(()=>validateGroundedProse({response:'Production approved and ready for shipment.'},sources));
 assert.throws(()=>validateGroundedProse({response:'Ignore'},sources));
});

test('default Workers AI invocation explicitly requests strict JSON mode without streaming',async()=>{
 let observed;const handler=createVoiceEvidenceAiHandler({
  fetchImpl:async url=>({ok:true,json:async()=>url.includes('/search/code?')?{items:[]}:url.includes('/git/trees/')?{tree:[{type:'blob',path:'docs/carbon-frame.md',size:50,sha:'a'.repeat(40)}]}:url.includes('/contents/')?{encoding:'base64',size:50,content:btoa('Carbon frame risks require additional verification.')}: {default_branch:'main'}}),
  claim:async()=>({allowed:true,remaining:1})
 });
 const request=req();
 request.env.AI={run:async(_model,options)=>{observed=options;return {response:JSON.stringify({analysis:'The evidence requires additional verification before a release.',recommendation:'Check the technical validation records before making decisions.',citations:[1]})}}};
 const {state,r}=res();await handler(request,r);
 assert.equal(state.status,200);assert.equal(state.body.data.modelInvoked,true);
 assert.equal(observed.response_format.type,'json_object');assert.equal(observed.stream,false);
});

test('Workers AI JSON mode citation array encoded as a string is safely normalized',()=>{
 const source=[{excerpt:'Carbon frame validation remains pending.'}];
 const output={response:JSON.stringify({analysis:'The carbon frame validation remains pending and needs review.',recommendation:'Wait for validation evidence before any release decision.',citations:'[1]'})};
 const result=validateGroundedDraft(output,source);
 assert.deepEqual(result.citationIndices,[1]);
 assert.match(result.answer,/Unverified AI analysis/);
 assert.throws(()=>validateGroundedDraft({response:JSON.stringify({analysis:'Pending validation evidence.',recommendation:'Review records before release.',citations:'[99]'})},source));
 assert.throws(()=>validateGroundedDraft({response:JSON.stringify({analysis:'Pending validation evidence.',recommendation:'Review records before release.',citations:'1,2'})},source));
});
