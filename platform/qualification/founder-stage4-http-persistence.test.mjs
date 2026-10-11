// End-to-end synthetic founder request -> real Stage 4 handler -> real PG RPCs.
// Never runs against production: POSTGRES_DB is a disposable Actions service.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createSessionToken,SESSION_COOKIE} from '../../apps/web/lib/auth.mjs';
import {invokeCloudflareHandler} from '../../apps/web/lib/cloudflare-adapter.mjs';
import {createFounderChatHandler} from '../../apps/web/api/founder-chat.mjs';
import {createFounderChatStore} from '../persistence/founder-chat-store.mjs';
import {prepareFounderMissionReport} from '../../apps/web/lib/founder-report-preview.mjs';
import {runFounderAiDraft} from '../../apps/web/lib/founder-ai-draft.mjs';

const EMAIL='shyamsundhar1982@gmail.com';
const MID='00000000-0000-4000-8000-000000000001';
const MISSION='MISSION-0001';
const KEY='synthetic-test-server-key';
const BOT='project';
const ENDPOINT='https://stage4-qualification.invalid/api/founder-chat';
const BODY={operation:'GENERATE_READONLY_DRAFT',agentId:BOT,messageId:MID,missionId:MISSION};
const reportFacts={missionId:MISSION,missionStatus:'READY_FOR_CLOSURE',
  verifiedWorkPackages:1,totalWorkPackages:1,blockedWorkPackageIds:[],evidenceRefs:['synthetic-evidence-1']};

function lit(v){return "'"+String(v).replaceAll("'","''")+"'";}
function query(sql){
 const out=execFileSync('psql',['-X','--tuples-only','--no-align','--set','ON_ERROR_STOP=1','--command',sql],
 {encoding:'utf8',timeout:12000});
 return out.trim();
}
function rpc(operation,input){
 const p=input||{};let args;
 switch(operation){
  case 'founderChatGet':
   args=[lit(KEY),lit(p.messageId),lit(p.actorEmail),lit(p.agentId)];break;
  case 'founderChatClaim':
   args=[lit(KEY),lit(p.messageId),lit(p.actorEmail),lit(p.agentId),lit(p.missionId)];break;
  case 'founderChatAppend':
   args=[lit(KEY),lit(p.messageId),lit(p.actorEmail),lit(p.agentId),lit(p.missionId),
    lit(p.content),lit(p.sourceHash),p.evidenceRefs?.length
    ? 'ARRAY['+p.evidenceRefs.map(lit).join(',')+']::text[]' : 'ARRAY[]::text[]'];break;
  default:throw Error('UNEXPECTED_STAGE4_RPC_OPERATION');
 }
 const name={founderChatGet:'vaos_founder_chat_get',founderChatClaim:'vaos_founder_chat_claim',
 founderChatAppend:'vaos_founder_chat_append'}[operation];
 return JSON.parse(query('select public.'+name+'('+args.join(',')+')::text;'));
}
const fetchImpl=async(url,opts)=>{
 assert.equal(url,'https://synthetic.supabase.invalid/functions/v1/vaos-control');
 assert.equal(opts.headers['x-vaos-server-key'],KEY);
 const body=JSON.parse(opts.body);
 return {ok:true,json:async()=>rpc(body.operation,body.payload)};
};
const store=createFounderChatStore({url:'https://synthetic.supabase.invalid',
 serverSecret:KEY,fetchImpl});

const getInbox=()=>({async list({actorEmail,agentId}){
 assert.equal(actorEmail,EMAIL);
 const value=query('select coalesce(jsonb_agg(jsonb_build_object('+
 "'messageId',id,'recipientAgentId',recipient_agent_id,'kind',kind,'status',status,'instruction',instruction))"+
 ",'[]'::jsonb)::text from vaos_private.founder_inbox_messages where sender_email="+lit(actorEmail)+
 " and recipient_agent_id="+lit(agentId)+";");
 return {messages:JSON.parse(value)};
}});
const snapshot={mission:{id:MISSION,status:'READY_FOR_CLOSURE',updated_at:'2026-10-11T00:00:00Z'},
 workPackages:[{id:'wp-synthetic',owner_agent_id:BOT,action_type:'PROJECT.TRACK_DEPENDENCY',status:'COMPLETED'}],
 handoffs:[{work_package_id:'wp-synthetic',to_agent_id:BOT,status:'COMPLETED',
  verified_by_agent_id:'orchestrator',evidence_refs:['synthetic-evidence-1','REVIEWED:synthetic-evidence-1']}]};
const recorded={messageId:MID,recipientAgentId:BOT,kind:'REPORT_REQUEST',
 status:'RECORDED_NOT_ROUTED',instruction:'Summarize mission MISSION-0001'};
const verifiedReport=prepareFounderMissionReport({record:recorded,agentId:BOT,messageId:MID,
 missionId:MISSION,snapshot});
let modelCalls=0;
const getMission=()=>({async snapshot(id){assert.equal(id,MISSION);return snapshot;}});
const runAi=async({agentId,instruction,report})=>{
 modelCalls++;
 const ai={async run(_model,params){
 assert.equal(params.max_tokens,256);
 assert.equal(Object.hasOwn(params,'tools'),false);
 return {response:JSON.stringify(reportFacts)};
 }};
 return runFounderAiDraft({ai,agentId,instruction,report});
};
const handler=createFounderChatHandler({getInbox,getReplies:()=>store,getMission,runAi});
function request(opts={}){
 const headers={'content-type':'application/json',
  origin:opts.origin||'https://stage4-qualification.invalid'};
 if(opts.email!==null)headers.cookie=SESSION_COOKIE+'='+createSessionToken(opts.email||EMAIL);
 return new Request(ENDPOINT,{method:'POST',headers,body:JSON.stringify(opts.body||BODY)});
}
const env={VAOS_FOUNDER_INBOX_CONTROL:'record-only-v1',
 VAOS_FOUNDER_AGENT_REPORT_CONTROL:'preview-only-v1',
 VAOS_FOUNDER_CHAT_CONTROL:'qualified-readonly-v1'};
async function send(opts={},flags=env){
 const r=await invokeCloudflareHandler(handler,request(opts),flags);
 return {status:r.status,response:await r.json(),headers:r.headers};
}
test('authenticated Founder Stage 4 persists one immutable AI draft with matching source hash',async()=>{
 assert.equal(query("select count(*) from vaos_private.founder_agent_drafts;"),'0');
 assert.equal(query("select count(*) from vaos_private.founder_agent_draft_claims;"),'0');

 // Unauthenticated, checker, wrong Origin and disabled gates cannot claim.
 for(const [opts,flags,expected] of [
  [{email:null},env,401],
  [{email:'kaaviyam1519@gmail.com'},env,403],
  [{origin:'https://malicious.invalid'},env,403],
  [{},{...env,VAOS_FOUNDER_CHAT_CONTROL:'off'},409]
 ]){
  const r=await send(opts,flags);assert.equal(r.status,expected);
 }
 assert.equal(modelCalls,0);
 assert.equal(query("select count(*) from vaos_private.founder_agent_draft_claims;"),'0');

 const first=await send();
 assert.equal(first.status,201,JSON.stringify(first.response));
 assert.equal(first.response.data.outcome,'RECORDED');
 assert.equal(first.response.data.reply.status,'AI_DRAFT_UNVERIFIED');
 assert.equal(first.response.data.actionAuthorized,false);
 assert.equal(modelCalls,1);

 // Independent SQL readback of actual COMMITTED rows, not the in-memory response.
 const raw=query('select row_to_json(t)::text from (select request_message_id::text,'+
  'mission_id,source_hash,evidence_refs,model,status,content from '+
  'vaos_private.founder_agent_drafts where request_message_id='+lit(MID)+'::uuid) t;');
 const stored=JSON.parse(raw);
 const expectedHash=crypto.createHash('sha256')
  .update(JSON.stringify(verifiedReport)).digest('hex');
 assert.equal(stored.source_hash,expectedHash);
 assert.equal(first.response.data.reply.sourceHash,expectedHash);
 assert.deepEqual(stored.evidence_refs,['synthetic-evidence-1']);
 assert.equal(stored.content,first.response.data.reply.content);
 assert.equal(stored.status,'AI_DRAFT_UNVERIFIED');
 assert.equal(stored.mission_id,MISSION);
 assert.equal(query('select count(*) from vaos_private.founder_agent_drafts;'),'1');
 assert.equal(query('select count(*) from vaos_private.founder_agent_draft_claims;'),'1');

 const replay=await send();
 assert.equal(replay.status,200);
 assert.equal(replay.response.data.outcome,'REPLAY');
 assert.equal(replay.response.data.modelInvoked,false);
 assert.equal(replay.response.data.reply.sourceHash,expectedHash);
 assert.equal(modelCalls,1,'REPLAY MUST NOT REINVOKE MODEL');

 const unrelated=await send({body:{...BODY,missionId:'MISSION-0002'}});
 assert.equal(unrelated.status,409);
 assert.equal(modelCalls,1);
 const anon=await send({email:null});
 assert.equal(anon.status,401);
 assert.equal(modelCalls,1);

 assert.equal(query('select count(*) from vaos_private.founder_agent_drafts;'),'1');
 console.log('STAGE4_AUTHENTICATED_HTTP_SQL_HASH_READBACK_PASS');
});
