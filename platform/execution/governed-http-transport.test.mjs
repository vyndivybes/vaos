import test from 'node:test';
import assert from 'node:assert/strict';
import { createGovernedHttpTransport } from './governed-http-transport.mjs';

function fakeResponse({status=200,headers={'content-type':'application/json'},body='{}'}={}) {
  const entries=Object.entries(headers);
  const bytes=new TextEncoder().encode(body);
  return {
    status,
    headers:{
      entries(){ return entries[Symbol.iterator](); },
      get(name){
        const found=entries.find(([k])=>k.toLowerCase()===name.toLowerCase());
        return found?.[1] ?? null;
      },
    },
    async arrayBuffer(){ return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength); },
  };
}

test('transport allows only configured HTTPS origins and parses bounded JSON', async()=>{
  const calls=[];
  const transport=createGovernedHttpTransport({
    allowedOrigins:['https://api.example.com'],
    fetchImpl:async (url,init)=>{
      calls.push({url,init});
      return fakeResponse({body:'{"ok":true}'});
    },
  });
  const result=await transport.request({
    url:'https://api.example.com/v1/run',
    method:'POST',
    headers:{'X-Correlation-ID':'job-1'},
    body:{hello:'world'},
    timeoutMs:5000,
    allowedResponseTypes:['application/json'],
  });
  assert.equal(result.status,200);
  assert.deepEqual(result.body,{ok:true});
  assert.equal(calls[0].init.redirect,'manual');
});

test('http scheme and non-allow-listed origin fail before fetch', async()=>{
  let touched=false;
  const transport=createGovernedHttpTransport({
    allowedOrigins:['https://api.example.com'],
    fetchImpl:async()=>{touched=true;},
  });
  await assert.rejects(()=>transport.request({url:'http://api.example.com/x',method:'GET'}),/GOV_HTTP_URL_INVALID/);
  await assert.rejects(()=>transport.request({url:'https://evil.example.net/x',method:'GET'}),/GOV_HTTP_ORIGIN_NOT_ALLOWED/);
  assert.equal(touched,false);
});

test('redirects are blocked instead of following to an unapproved destination', async()=>{
  const transport=createGovernedHttpTransport({
    allowedOrigins:['https://api.example.com'],
    fetchImpl:async()=>fakeResponse({status:302,headers:{location:'https://evil.example.net'}}),
  });
  await assert.rejects(()=>transport.request({url:'https://api.example.com/x',method:'GET'}),/GOV_HTTP_REDIRECT_BLOCKED/);
});

test('request and response size limits fail closed', async()=>{
  const big='x'.repeat(200);
  const transport=createGovernedHttpTransport({
    allowedOrigins:['https://api.example.com'],
    maxRequestBytes:100,
    maxResponseBytes:100,
    fetchImpl:async()=>fakeResponse({body:JSON.stringify({big})}),
  });
  await assert.rejects(()=>transport.request({url:'https://api.example.com/x',method:'POST',body:{big}}),/GOV_HTTP_REQUEST_TOO_LARGE/);

  const responseOnly=createGovernedHttpTransport({
    allowedOrigins:['https://api.example.com'],
    maxResponseBytes:100,
    fetchImpl:async()=>fakeResponse({body:JSON.stringify({big})}),
  });
  await assert.rejects(()=>responseOnly.request({url:'https://api.example.com/x',method:'GET'}),/GOV_HTTP_RESPONSE_TOO_LARGE/);
});

test('unexpected response content type is rejected before parsing', async()=>{
  const transport=createGovernedHttpTransport({
    allowedOrigins:['https://api.example.com'],
    fetchImpl:async()=>fakeResponse({headers:{'content-type':'text/html'},body:'<html>bad</html>'}),
  });
  await assert.rejects(
    ()=>transport.request({url:'https://api.example.com/x',method:'GET',allowedResponseTypes:['application/json']}),
    /GOV_HTTP_CONTENT_TYPE_REJECTED/,
  );
});

test('network/timeout error is conservatively classified as potentially sent and does not leak secret headers', async()=>{
  const transport=createGovernedHttpTransport({
    allowedOrigins:['https://api.example.com'],
    fetchImpl:async()=>{const e=new Error('Bearer secret-token connection failed');e.name='AbortError';throw e;},
  });
  await assert.rejects(
    async()=>{
      try{
        await transport.request({
          url:'https://api.example.com/x',method:'POST',
          headers:{Authorization:'Bearer secret-token'},body:{x:1},
        });
      }catch(error){
        assert.equal(error.code,'GOV_HTTP_TIMEOUT');
        assert.equal(error.requestSent,true);
        assert.equal(error.outcomeUnknown,true);
        assert.equal(error.message.includes('secret-token'),false);
        throw error;
      }
    },
    /GOV_HTTP_TIMEOUT/,
  );
});

test('authorization header is forwarded but never returned in result metadata', async()=>{
  const transport=createGovernedHttpTransport({
    allowedOrigins:['https://api.example.com'],
    fetchImpl:async (_url,init)=>{
      assert.equal(init.headers.Authorization,'Bearer secret-token');
      return fakeResponse({body:'{"ok":true}'});
    },
  });
  const result=await transport.request({
    url:'https://api.example.com/x',method:'GET',
    headers:{Authorization:'Bearer secret-token'},
  });
  assert.equal(JSON.stringify(result).includes('secret-token'),false);
});
