import test from 'node:test';
import assert from 'node:assert/strict';
import {createFounderConversationStore} from './founder-conversation-store.mjs';
test('conversation ledger uses server-key Edge RPC and only two allowlisted operations',async()=>{
 const requests=[];
 const store=createFounderConversationStore({url:'https://example.supabase.co/',serverSecret:'sensitive-test-key',
 fetchImpl:async(u,o)=>{requests.push({u,o});return {ok:true,json:async()=>({turns:[]})}}});
 await store.history({agentId:'project',missionId:'MISSION-0001'});
 await store.link({agentId:'project',missionId:'MISSION-0001'});
 assert.deepEqual(requests.map(x=>JSON.parse(x.o.body).operation),['founderConversationHistory','founderConversationLink']);
 assert.ok(requests.every(x=>x.o.headers['x-vaos-server-key']==='sensitive-test-key'));
 assert.ok(requests.every(x=>x.u==='https://example.supabase.co/functions/v1/vaos-control'));
 assert.ok(requests.every(x=>!x.o.body.includes('sensitive-test-key')));
});
test('storage config absent and backend failures fail closed',async()=>{
 assert.throws(()=>createFounderConversationStore({url:'https://example.invalid'}));
 const store=createFounderConversationStore({url:'https://example.invalid',serverSecret:'secret',fetchImpl:async()=>({ok:false})});
 await assert.rejects(()=>store.history({}),/FOUNDER_CONVERSATION_STORAGE_UNAVAILABLE/);
});
