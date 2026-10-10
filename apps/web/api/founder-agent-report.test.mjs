import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionToken,SESSION_COOKIE} from '../lib/auth.mjs';
import {createFounderAgentReportHandler} from './founder-agent-report.mjs';
import {DEFAULT_API_HANDLERS} from '../cloudflare-worker.mjs';
const messageId='4e20184d-bf10-4246-b95f-590ee871e9b1';
const body={operation:'PREVIEW_MISSION_REPORT',agentId:'project',messageId,missionId:'mission-a'};
const saved={messageId,recipientAgentId:'project',kind:'REPORT_REQUEST',status:'RECORDED_NOT_ROUTED'};
function input(options={}){
const email=options.email===undefined?'shyamsundhar1982@gmail.com':options.email;
return {method:options.method||'POST',url:'https://vaos.example/api/founder-agent-report',
headers:{cookie:email?SESSION_COOKIE+'='+createSessionToken(email):'',
origin:options.origin===undefined?'https://vaos.example':options.origin,
'content-type':options.contentType||'application/json'},body:options.body??body,
env:{VAOS_FOUNDER_INBOX_CONTROL:options.inbox===false?'off':'record-only-v1',
VAOS_FOUNDER_AGENT_REPORT_CONTROL:options.enabled===false?'off':'preview-only-v1'}};
}
function response(){const o={status:200,headers:{},body:null};
const r={setHeader(k,v){o.headers[k]=v;return r},status(s){o.status=s;return r},json(x){o.body=x;return r}};return {o,r};}
function fixture(messages=[saved]){const calls=[];const handler=createFounderAgentReportHandler({
getInboxStore:()=>({async list(x){calls.push(['list',x]);return {messages}}}),
getMissionService:()=>({async snapshot(id){calls.push(['snapshot',id]);return {mission:{id,status:'ACTIVE'},workPackages:[],handoffs:[]}}})
});return {handler,calls};}
test('read-only report API is present in Worker',()=>assert.equal(typeof DEFAULT_API_HANDLERS['/api/founder-agent-report'],'function'));
test('founder-only and feature-off boundaries deny access before stores',async()=>{
const f=fixture();
for(const [o,code] of [[{email:null},401],[{email:'kaaviyam1519@gmail.com'},403],
[{enabled:false},409],[{inbox:false},409],[{origin:'https://bad.example'},403],
[{contentType:'text/plain'},415],[{method:'GET'},405]]){
const v=response();await f.handler(input(o),v.r);assert.equal(v.o.status,code);}
assert.deepEqual(f.calls,[]);
});
test('forged bodies cannot select another agent or control execution',async()=>{
const f=fixture();
for(const b of [{...body,agentId:'finance'},{...body,operation:'EXECUTE'},
{...body,actor:'founder'},{...body,messageId:'fake'}]){
const v=response();await f.handler(input({body:b}),v.r);assert.equal(v.o.status,422);}
assert.deepEqual(f.calls,[]);
});
test('only matching stored requests obtain a read-only evidence preview',async()=>{
const f=fixture();const v=response();await f.handler(input(),v.r);
assert.equal(v.o.status,200);assert.equal(v.o.body.data.status,'READ_ONLY_PREVIEW_NOT_AGENT_REPLY');
assert.equal(v.o.body.data.actionAuthorized,false);
assert.deepEqual(f.calls,[['list',{agentId:'project',actorEmail:'shyamsundhar1982@gmail.com'}],['snapshot','mission-a']]);
});
test('unconfirmed or non-report requests never read a mission',async()=>{
for(const messages of [[],[{...saved,kind:'INSTRUCTION'}],[{...saved,status:'DRAFT_NOT_SENT'}]]){
const f=fixture(messages),v=response();await f.handler(input(),v.r);
assert.equal(v.o.status,409);assert.equal(f.calls.filter(c=>c[0]==='snapshot').length,0);}
});
test('internal errors are redacted',async()=>{
const h=createFounderAgentReportHandler({getInboxStore:()=>({async list(){throw Error('secret-value')}})});
const v=response();await h(input(),v.r);assert.equal(v.o.status,503);
assert.doesNotMatch(JSON.stringify(v.o.body),/secret-value/);
});
