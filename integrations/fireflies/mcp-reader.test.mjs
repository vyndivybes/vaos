import test from 'node:test';
import assert from 'node:assert/strict';
import { createFirefliesMcpReader } from './mcp-reader.mjs';

const client = (overrides={}) => {
  const calls=[];
  const transport = {
    async request({url, method, headers, body, allowedResponseTypes}) {
      assert.equal(url,'https://api.fireflies.ai/mcp');
      assert.equal(method,'POST');
      assert.equal(headers.Authorization,'Bearer test-secret');
      assert.ok(allowedResponseTypes.includes('text/event-stream'));
      const req=JSON.parse(body);
      calls.push(req);
      if(req.method==='notifications/initialized') return {status:202,headers:{},body:null};
      let result;
      if(req.method==='initialize') result={protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'fireflies',version:'1'}};
      else if(req.method==='tools/list') result={tools:[
        {name:'get_user',inputSchema:{type:'object',properties:{}}},
        {name:'get_transcripts',inputSchema:{type:'object',properties:{}}},
        {name:'get_summary',inputSchema:{type:'object',properties:{}}},
        {name:'share_meeting',inputSchema:{type:'object',properties:{}}},
      ]};
      else result={content:[{type:'text',text:JSON.stringify({data:[{id:'m-1'}]})}]};
      return {status:200,headers:{'content-type':'application/json','mcp-session-id':'session123'},body:{jsonrpc:'2.0',id:req.id,result}};
    },
  };
  const opts={enabled:true,transport,
    resolveCredential:async()=>({accessToken:'test-secret',accountId:'fireflies-account-1'}),
    authorize:async()=>true,
    reserveQuota:async()=>true,
    ...overrides,
  };
  return {reader:createFirefliesMcpReader(opts),calls};
};
const context={tenantId:'tenant-a',actorId:'actor-1',accountId:'fireflies-account-1'};

test('read-only identity and bounded search use MCP initialize/discover/call',async()=>{
  const {reader,calls}=client();
  const result=await reader.getUser(context);
  assert.equal(result.source,'fireflies');
  assert.equal(result.advisoryOnly,true);
  assert.equal(result.trustedInstructions,false);
  assert.equal(calls[0].method,'initialize');
  assert.equal(calls[1].method,'notifications/initialized');
  assert.equal(calls[2].method,'tools/list');
  assert.equal(calls[3].params.name,'get_user');
  assert.equal((await reader.searchMeetings(context,{limit:2})).operation,'searchMeetings');
});

test('disabled, missing authorization, mismatched account and missing quota all fail closed',async()=>{
  const {reader}=client({enabled:false});
  await assert.rejects(()=>reader.getUser(context),/FIREFLIES_DISABLED/);
  const denied=client({authorize:async()=>false});
  await assert.rejects(()=>denied.reader.getUser(context),/FIREFLIES_ACCESS_DENIED/);
  const mismatch=client({resolveCredential:async()=>({accessToken:'test-secret',accountId:'other'})});
  await assert.rejects(()=>mismatch.reader.getUser(context),/FIREFLIES_ACCOUNT_MISMATCH/);
  const limited=client({reserveQuota:async()=>false});
  await assert.rejects(()=>limited.reader.getUser(context),/FIREFLIES_DAILY_QUOTA_BLOCKED/);
  assert.throws(()=>createFirefliesMcpReader({enabled:true}),/FIREFLIES_PORT_REQUIRED/);
});

test('invalid search and transcript ids are rejected before network access',async()=>{
  const {reader,calls}=client();
  assert.throws(()=>reader.searchMeetings(context,{limit:51}),/FIREFLIES_INPUT_INVALID/);
  assert.throws(()=>reader.getSummary(context,'../../escape'),/FIREFLIES_INPUT_INVALID/);
  assert.equal(calls.length,0);
});

test('HTTP redirects, remote errors and oversized response are rejected without secret output',async()=>{
  const redirected=client({transport:{request:async()=>({status:302,headers:{location:'https://elsewhere'},body:null})}});
  await assert.rejects(()=>redirected.reader.getUser(context),/FIREFLIES_REMOTE_UNAVAILABLE/);
  const bad=client({transport:{request:async()=>({status:401,headers:{},body:'Bearer test-secret'})}});
  await assert.rejects(()=>bad.reader.getUser(context),e=>{
    assert.equal(e.code,'FIREFLIES_AUTH_FAILED');
    assert.equal(JSON.stringify(e).includes('test-secret'),false);
    return true;
  });
  const giant=client({transport:{request:async()=>({status:200,headers:{},body:'x'.repeat(600000)})}});
  await assert.rejects(()=>giant.reader.getUser(context),/FIREFLIES_RESPONSE_TOO_LARGE/);
});

test('source tool mutation is never available even when discovered',async()=>{
  const {reader,calls}=client();
  assert.equal(typeof reader.shareMeeting,'undefined');
  await reader.getUser(context);
  assert.equal(calls.some(x=>x.params?.name==='share_meeting'),false);
});

test('streamable HTTP SSE replies are parsed without following external URLs',async()=>{
  const calls=[];
  const transport={async request({url,headers,body}) {
    const req=JSON.parse(body);calls.push(req.method);
    if(req.method==='notifications/initialized')return {status:202,headers:{},body:null};
    let result=req.method==='initialize'?{capabilities:{tools:{}}}
      :req.method==='tools/list'?{tools:[{name:'fireflies_get_summary'}]}
      :{content:[{type:'text',text:'{"overview":"Read-only summary"}'}]};
    const event='event: message\ndata: '+JSON.stringify({jsonrpc:'2.0',id:req.id,result})+'\n\n';
    return {status:200,headers:{'content-type':'text/event-stream'},body:event};
  }};
  const reader=createFirefliesMcpReader({enabled:true,transport,
    resolveCredential:async()=>({accessToken:'test-secret',accountId:context.accountId}),
    authorize:async()=>true,reserveQuota:async()=>true});
  const response=await reader.getSummary(context,'meeting-1');
  assert.equal(response.operation,'getSummary');
  assert.ok(calls.includes('tools/call'));
});
test('quota admission is required separately for every MCP protocol request',async()=>{
  let reservations=0;
  const {reader}=client({reserveQuota:async()=>{reservations++;return reservations<=3}});
  await assert.rejects(()=>reader.getUser(context),/FIREFLIES_DAILY_QUOTA_BLOCKED/);
  assert.equal(reservations,4);
});
