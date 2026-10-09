import test from 'node:test';import assert from 'node:assert/strict';
import {createActivepiecesToolClient} from './mcp-tool-client.mjs';
test('authenticated MCP tool calls initialize, retain session, do not follow redirects',async()=>{
  const calls=[];const fetchImpl=async(url,opts)=>{calls.push(opts);const req=JSON.parse(opts.body);
    if(req.method==='notifications/initialized')return new Response(null,{status:202});
    const result=req.method==='initialize'?{capabilities:{tools:{}}}
      :req.method==='tools/list'?{tools:[{name:'ap_get_run'}]}
      :{content:[{type:'text',text:'{"status":"ok"}'}]};
    return new Response(JSON.stringify({jsonrpc:'2.0',id:req.id,result}),{headers:{'Content-Type':'application/json','Mcp-Session-Id':'s123'}});
  };
  const c=createActivepiecesToolClient({accessToken:'demo-token-12345678',fetchImpl});
  assert.equal((await c.tools())[0].name,'ap_get_run');
  assert.equal((await c.call('ap_get_run',{flowRunId:'testrun'})).content[0].type,'text');
  assert.equal(calls.length,4);
  assert.equal(calls.at(-1).headers['Mcp-Session-Id'],'s123');
  assert.ok(calls.every(x=>x.redirect==='manual'));
});
test('unsupported redirects return explicit non-success',async()=>{
  const c=createActivepiecesToolClient({accessToken:'demo-token-12345678',fetchImpl:async()=>new Response(null,{status:302,headers:{Location:'https://evil.example'}})});
  await assert.rejects(()=>c.tools(),/AP_MCP_HTTP_302/);
});
