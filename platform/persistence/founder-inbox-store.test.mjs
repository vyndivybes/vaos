import test from 'node:test';
import assert from 'node:assert/strict';
import {createFounderInboxStore} from './founder-inbox-store.mjs';
test('uses server-side Edge RPC credential without leaking it into output',async()=>{
 const requests=[];
 const fetchImpl=async(url,opts)=>{
  requests.push({url,opts});
  return {ok:true,json:async()=>({outcome:'RECORDED',message:{messageId:'id',status:'RECORDED_NOT_ROUTED'}})};
 };
 const store=createFounderInboxStore({url:'https://vaos.supabase.co/',serverSecret:'test-only-key',fetchImpl});
 const result=await store.append({messageId:'id',actorEmail:'founder@example.com',agentId:'qa',kind:'INSTRUCTION',instruction:'Inspect'});
 assert.equal(result.outcome,'RECORDED');
 const body=JSON.parse(requests[0].opts.body);
 assert.equal(requests[0].url,'https://vaos.supabase.co/functions/v1/vaos-control');
 assert.equal(requests[0].opts.headers['x-vaos-server-key'],'test-only-key');
 assert.equal(body.operation,'founderInboxAppend');
 assert.equal(JSON.stringify(result).includes('test-only-key'),false);
});
test('rejects absent server configuration and Edge failures',async()=>{
 assert.throws(()=>createFounderInboxStore({url:'https://example.com'}));
 const store=createFounderInboxStore({url:'https://example.com',serverSecret:'test',fetchImpl:async()=>({ok:false,status:500})});
 await assert.rejects(()=>store.list({actorEmail:'founder@example.com',agentId:'qa'}),/FOUNDER_INBOX_UNAVAILABLE/);
});
