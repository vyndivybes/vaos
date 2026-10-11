import test from 'node:test';import assert from 'node:assert/strict';
import {createSessionToken,SESSION_COOKIE} from '../lib/auth.mjs';
import {createFederatedKnowledgeHandler} from './federated-knowledge.mjs';
import {DEFAULT_API_HANDLERS} from '../cloudflare-worker.mjs';
function response(){const x={status:200,body:null};const res={setHeader(){return res;},status(n){x.status=n;return res;},json(b){x.body=b;return res;}};return {x,res};}
async function call({email='shyamsundhar1982@gmail.com',flag='founder-readonly-v1',q='carbon frame',token='012345678901234567890123456789',method='GET'}={}){
 const {x,res}=response();const calls=[];
 const fetchImpl=async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>url.includes('/search/code?')?{items:[]}:url.includes('/git/trees/')?{tree:[],truncated:false}:{default_branch:'main'}};};
 const req={method,url:'https://vaos.example/api/federated-knowledge?q='+encodeURIComponent(q),
 headers:{cookie:email?`${SESSION_COOKIE}=${createSessionToken(email)}`:''},
 env:{VAOS_FEDERATED_KNOWLEDGE_CONTROL:flag,VAOS_FEDERATED_GITHUB_TOKEN:token}};
 await createFederatedKnowledgeHandler({fetchImpl})(req,res);return {x,calls};}
test('route is registered',()=>assert.equal(typeof DEFAULT_API_HANDLERS['/api/federated-knowledge'],'function'));
test('deny unauthenticated, unknown identity and disabled flag',async()=>{
 assert.equal((await call({email:null})).x.status,401);
 assert.ok([401,403].includes((await call({email:'another@example.com'})).x.status));
 assert.equal((await call({flag:'off'})).x.status,409);
 assert.equal((await call({method:'POST'})).x.status,405);
});
test('reject sensitive queries without external requests',async()=>{
 const r=await call({q:'show api key secrets'});assert.equal(r.x.status,422);assert.equal(r.calls.length,0);
});
test('search only three approved repositories through GET without business effects',async()=>{
 const r=await call();assert.equal(r.x.status,200);assert.equal(r.calls.length,9);
 assert.ok(r.calls.every(c=>c.options.method==='GET'&&c.options.redirect==='manual'&&c.url.startsWith('https://api.github.com/')));
 assert.equal(r.x.body.data.actionAuthorized,false);
 assert.equal(r.x.body.data.evidenceQualified,false);
});

test('total upstream failure returns 503 with safe diagnostic categories',async()=>{
 const {x,res}=response();const req={method:'GET',url:'https://vaos.example/api/federated-knowledge?q=carbon%20frame',headers:{cookie:`${SESSION_COOKIE}=${createSessionToken('shyamsundhar1982@gmail.com')}`},env:{VAOS_FEDERATED_KNOWLEDGE_CONTROL:'founder-readonly-v1',VAOS_FEDERATED_GITHUB_TOKEN:'012345678901234567890123456789'}};
 await createFederatedKnowledgeHandler({fetchImpl:async()=>({ok:false,status:401})})(req,res);
 assert.equal(x.status,503);assert.equal(x.body.data.sourceFailures.length,3);
 assert.ok(x.body.data.sourceFailures.every(f=>f.code==='UNAUTHORIZED'));
 assert.equal(JSON.stringify(x.body).includes('012345678901234567890123456789'),false);
});

test('GitHub redirect is never followed with bearer token',async()=>{
 const {x,res}=response();let count=0;
 const req={method:'GET',url:'https://vaos.example/api/federated-knowledge?q=carbon%20frame',headers:{cookie:`${SESSION_COOKIE}=${createSessionToken('shyamsundhar1982@gmail.com')}`},env:{VAOS_FEDERATED_KNOWLEDGE_CONTROL:'founder-readonly-v1',VAOS_FEDERATED_GITHUB_TOKEN:'012345678901234567890123456789'}};
 await createFederatedKnowledgeHandler({fetchImpl:async(_url,options)=>{count++;assert.equal(options.redirect,'manual');return {ok:false,status:302};}})(req,res);
 assert.equal(count,3);assert.equal(x.status,503);
 assert.ok(x.body.data.sourceFailures.every(x=>x.code==='UPSTREAM_HTTP_ERROR'));
});

test('tree fallback retrieves source-linked excerpts when code search returns nothing',async()=>{
 const {x,res}=response();
 const token='012345678901234567890123456789';
 const req={method:'GET',url:'https://vaos.example/api/federated-knowledge?q=carbon%20frame',headers:{cookie:`${SESSION_COOKIE}=${createSessionToken('shyamsundhar1982@gmail.com')}`},env:{VAOS_FEDERATED_KNOWLEDGE_CONTROL:'founder-readonly-v1',VAOS_FEDERATED_GITHUB_TOKEN:token}};
 const sha='a'.repeat(40);
 const fetchImpl=async url=>({ok:true,json:async()=>url.includes('/search/code?')?{items:[]}:url.includes('/git/trees/')?{tree:[{type:'blob',path:'docs/carbon-frame.md',size:48,sha}],truncated:false}:url.includes('/contents/')?{encoding:'base64',size:48,content:btoa('Carbon frame geometry revision under review.')}: {default_branch:'main'}});
 await createFederatedKnowledgeHandler({fetchImpl})(req,res);
 assert.equal(x.status,200);assert.equal(x.body.data.evidence.length,3);
 assert.equal(x.body.data.evidence[0].excerpts[0].line,1);
 assert.equal(x.body.data.evidence[0].repository,'vayu-shastr/veloxis-engineering-design-manual');
 assert.equal(x.body.data.evidenceQualified,false);
});
