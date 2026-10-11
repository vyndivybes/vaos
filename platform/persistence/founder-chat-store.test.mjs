import test from 'node:test';
import assert from 'node:assert/strict';
import {createFounderChatStore} from './founder-chat-store.mjs';
test('Edge server secret stays server side and operations use exact RPC names',async()=>{
 const requests=[];
 const store=createFounderChatStore({url:'https://example.supabase.co/',serverSecret:'test-only',
 fetchImpl:async(u,o)=>{requests.push([u,o]);return {ok:true,json:async()=>({reply:null})}}});
 const a={actorEmail:'founder@example.test',agentId:'project',messageId:'dummy'};
 await store.get(a);await store.claim(a);await store.append({...a,content:'draft'});
 assert.equal(requests.length,3);
 assert.deepEqual(requests.map(x=>JSON.parse(x[1].body).operation),['founderChatGet','founderChatClaim','founderChatAppend']);
 assert.equal(requests[0][1].headers['x-vaos-server-key'],'test-only');
 assert.equal(JSON.stringify(a).includes('test-only'),false);
});
test('missing secret and failed Edge requests fail closed',async()=>{
 assert.throws(()=>createFounderChatStore({url:'https://test.invalid'}));
 const store=createFounderChatStore({url:'https://test.invalid',serverSecret:'server-key',
 fetchImpl:async()=>({ok:false,status:500})});
 await assert.rejects(()=>store.get({}),/FOUNDER_CHAT_STORAGE_UNAVAILABLE/);
});
