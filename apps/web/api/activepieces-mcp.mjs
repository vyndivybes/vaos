import { parseCookies, SESSION_COOKIE, verifySessionToken } from '../lib/auth.mjs';
import { beginActivepiecesAuthorization, completeActivepiecesAuthorization } from '../../../integrations/activepieces/mcp-oauth-handshake.mjs';

function page(title,body,status=200) {
  const html='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    +'<title>'+title+'</title><main style="font:16px Arial,sans-serif;max-width:680px;margin:8vh auto;padding:24px">'
    +'<h1>'+title+'</h1>'+body+'</main></html>';
  return new Response(html,{status,headers:{
    'Content-Type':'text/html; charset=utf-8',
    'Cache-Control':'no-store',
    'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    'X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'no-referrer',
  }});
}
const fail=(status,code)=>new Response(JSON.stringify({error:{code}}),{status,headers:{
  'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
}});
function session(req) {
  return verifySessionToken(parseCookies(req.headers.cookie||'')[SESSION_COOKIE]);
}
function vault(env) {
  const ns=env?.ACTIVEPIECES_HANDSHAKE;
  if(!ns||typeof ns.idFromName!=='function'||typeof ns.get!=='function')
    throw new Error('ACTIVEPIECES_HANDSHAKE_BINDING_MISSING');
  return ns.get(ns.idFromName('vaos-activepieces-v1'));
}
function str(value) {
  return typeof value==='string'?value:'';
}

export default async function activepiecesOAuthHandler(req,res) {
  const path=new URL(req.url).pathname;
  if(path==='/api/activepieces-mcp/callback') {
    if(req.method!=='GET')return fail(405,'METHOD_NOT_ALLOWED');
    const u=new URL(req.url);
    if(u.searchParams.has('error'))return page('Activepieces authorization declined','<p>No VAOS automation was enabled.</p><a href="/api/activepieces-mcp">Return to commissioning</a>',403);
    try {
      const outcome=await completeActivepiecesAuthorization({
        nonce:str(u.searchParams.get('state')),
        code:str(u.searchParams.get('code')),
        store:vault(req.env),
      });
      if(outcome.status!=='MCP_READBACK_CAPABLE')throw Error('ACTIVEPIECES_READBACK_UNAVAILABLE');
      return page('Activepieces OAuth verification passed',
        '<p>Temporary OAuth authorization succeeded and read-only run-discovery tools were detected.</p>'
        +'<p><strong>Important:</strong> VAOS did not retain OAuth tokens, activate provider routing, or commission a live production workflow.</p>'
        +'<a href="/api/activepieces-mcp">View commissioning evidence</a>');
    }catch{
      return page('Activepieces OAuth verification failed',
        '<p>The handshake or read-only verification could not be completed. No production provider was enabled.</p>'
        +'<a href="/api/activepieces-mcp">Return to commissioning</a>',502);
    }
  }
  if(!session(req))return fail(401,'UNAUTHENTICATED');
  let stub;
  try{stub=vault(req.env)}catch{return fail(503,'ACTIVEPIECES_HANDSHAKE_UNAVAILABLE')}
  if(path==='/api/activepieces-mcp' && req.method==='GET') {
    return page('VAOS — Activepieces MCP commissioning',
      '<p>This initiates a one-time OAuth and read-only MCP tool-discovery test using the Activepieces account you approve.</p>'
      +'<p>The test does not incur an Activepieces action credit, perform a business operation, or retain OAuth tokens.</p>'
      +'<form action="/api/activepieces-mcp/start" method="post"><button type="submit" style="font-size:17px;padding:12px 18px">Authorize read-only test</button></form>'
      +'<p><a href="/api/activepieces-mcp/status">View current qualification evidence (JSON)</a></p>');
  }
  if(path==='/api/activepieces-mcp/status' && req.method==='GET'){
    const status=await stub.status();
    return new Response(JSON.stringify({providerId:'activepieces',mcpServer:'https://cloud.activepieces.com/mcp/platform',evidence:status,connected:false,productionActivation:false}),{
      status:200,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},
    });
  }
  if(path==='/api/activepieces-mcp/start' && req.method==='POST') {
    const actual=new URL(req.url);
    // Browser form sends Origin. Reject cross-site form submissions and public unauthenticated links.
    if(req.headers.origin!==actual.origin)return fail(403,'ORIGIN_INVALID');
    try {
      const authorizationUrl=await beginActivepiecesAuthorization({
        callbackUrl:'https://vaos.vayushastr.workers.dev/api/activepieces-mcp/callback',
        store:stub,
      });
      return Response.redirect(authorizationUrl,303);
    }catch{
      return page('Activepieces OAuth setup unavailable',
        '<p>Could not discover/register an OAuth client at Activepieces. No connection was created.</p>'
        +'<a href="/api/activepieces-mcp">Return to commissioning</a>',503);
    }
  }
  return fail(405,'METHOD_NOT_ALLOWED');
}
