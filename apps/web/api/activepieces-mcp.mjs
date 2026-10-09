import crypto from 'node:crypto';
import { constantTimeEqual, parseCookies, SESSION_COOKIE, verifySessionToken } from '../lib/auth.mjs';
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
function sessionToken(req) {
  return parseCookies(req.headers.cookie||'')[SESSION_COOKIE] || '';
}
function session(req) {
  return verifySessionToken(sessionToken(req));
}
function makerSession(req){return session(req)?.email==='shyamsundhar1982@gmail.com'}
// An unpredictable per-session CSRF proof replaces the false assumption that every
// browser's navigation POST includes an Origin header. This is not an OAuth token.
function csrfToken(req) {
  const cookieToken=sessionToken(req);
  return crypto.createHmac('sha256',cookieToken)
    .update('vaos:activepieces:mcp:start:v1').digest('hex');
}
function codeRecoveryCsrf(req) {
  return crypto.createHmac('sha256',sessionToken(req))
    .update('vaos:activepieces:code-recovery:v1').digest('hex');
}
function validCodeRecoveryCsrf(req){
  const contentType=String(req.headers?.['content-type']||'').split(';')[0].trim().toLowerCase();
  if(contentType!=='application/x-www-form-urlencoded'||
     typeof req.body!=='string'||req.body.length>256)return false;
  const vals=new URLSearchParams(req.body);
  const proof=vals.getAll('csrf');
  return [...vals.keys()].every(k=>k==='csrf')&&proof.length===1&&
    /^[a-f0-9]{64}$/.test(proof[0])&&
    constantTimeEqual(proof[0],codeRecoveryCsrf(req));
}
function validCsrf(req) {
  const contentType=String(req.headers['content-type']||'').split(';')[0].trim().toLowerCase();
  if(contentType!=='application/x-www-form-urlencoded' ||
     typeof req.body!=='string' || req.body.length>4096)return false;
  const values=new URLSearchParams(req.body).getAll('csrf');
  return values.length===1 && /^[a-f0-9]{64}$/.test(values[0])
    && constantTimeEqual(values[0],csrfToken(req));
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
      if(!['MCP_READBACK_CAPABLE','MCP_CREDENTIALS_SECURED'].includes(outcome.status))throw Error('ACTIVEPIECES_READBACK_UNAVAILABLE');
      return page('Activepieces OAuth verification passed',
        outcome.status==='MCP_CREDENTIALS_SECURED'
        ?'<p>OAuth tokens have been encrypted inside VAOS for controlled read-only verification. Production workflows remain disabled.</p>'
        :'<p>Temporary OAuth authorization succeeded and read-only run-discovery tools were detected. No tokens were retained.</p>'
        +'<a href="/api/activepieces-mcp">View commissioning evidence</a>');
    }catch{
      return page('Activepieces OAuth verification failed',
        '<p>The handshake or read-only verification could not be completed. No production provider was enabled.</p>'
        +'<a href="/api/activepieces-mcp">Return to commissioning</a>',502);
    }
  }
  if(path==='/api/activepieces-mcp/discovery-health'){
    if(req.method!=='GET')return fail(405,'METHOD_NOT_ALLOWED');
    try{
      const probe=await vault(req.env).probeDiscovery();
      // Public response intentionally contains only status and finite code;
      // no tenant credentials, OAuth state, client id or upstream text.
      return new Response(JSON.stringify({providerId:'activepieces',stage:'discovery',
        ok:probe.ok===true,code:probe.code,httpStatus:probe.httpStatus,
        cached:probe.cached===true,productionActivation:false}),{
        status:200,headers:{'Content-Type':'application/json; charset=utf-8',
        'Cache-Control':'public, max-age=60','X-Content-Type-Options':'nosniff'},
      });
    }catch{return fail(503,'DISCOVERY_HEALTH_UNAVAILABLE')}
  }
  if(path==='/api/activepieces-mcp/synthetic-evidence'){
    if(req.method!=='GET')return fail(405,'METHOD_NOT_ALLOWED');
    try{
      const v=await vault(req.env).syntheticEvidence();
      // Public independent auditor can verify status and hash-chain anchor without
      // exposing project, flow/run IDs, test marker, OAuth tokens or private outputs.
      const report={providerId:'activepieces',status:v.status,phase:v.phase,
        reason:v.reason,markerVerified:v.markerVerified,
        checksumVerified:v.checksumVerified,productionActivation:false,audit:v.audit,
        codeRecoveryStatus:['NOT_ADMITTED','ADMITTED','VERIFIED','HOLD'].includes(v.codeRecoveryStatus)
          ?v.codeRecoveryStatus:'NOT_ADMITTED'};
      return new Response(JSON.stringify(report),{status:200,
        headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    }catch{return fail(503,'AP_SYNTHETIC_EVIDENCE_UNAVAILABLE')}
  }
  if(path==='/api/activepieces-mcp/code-recovery'){
    if(!makerSession(req))return fail(403,'MAKER_REQUIRED');
    if(req.method==='GET'){
      return page('Activepieces isolated code-step recovery',
        '<p>The previous one-shot trigger admission is already consumed.</p>'
        +'<p>This approves one attempt to repair <code>step_1</code> in the exact existing disabled, unpublished synthetic flow, only after fresh safety checks. It will not retry the webhook trigger, execute a flow, publish, or activate production.</p>'
        +'<form method="post" action="/api/activepieces-mcp/code-recovery">'
        +'<input type="hidden" name="csrf" value="'+codeRecoveryCsrf(req)+'">'
        +'<button type="submit">Approve single CODE-step recovery</button></form>');
    }
    if(req.method!=='POST')return fail(405,'METHOD_NOT_ALLOWED');
    if(!validCodeRecoveryCsrf(req))return fail(403,'CODE_RECOVERY_CSRF_INVALID');
    try{
      const outcome=await vault(req.env).recoverSyntheticCodeStepOnce();
      const reason=/^AP_[A-Z0-9_]{3,100}$/.test(outcome?.reason||'')
        ?outcome.reason:'AP_CODE_RECOVERY_RESULT_UNKNOWN';
      const passed=outcome?.status==='PASS'&&reason==='AP_SANDBOX_CODE_READBACK_VERIFIED';
      return page(passed?'Activepieces CODE-step recovery verified':'Activepieces CODE-step recovery HOLD',
        '<p>Status: '+(passed?'PASS':'HOLD')+'</p>'
        +'<p>Reason: <code>'+reason+'</code></p>'
        +'<p>No synthetic test, production publishing, or activation has been performed.</p>'
        +'<a href="/api/activepieces-mcp/code-recovery">Review recovery gate</a>');
    }catch{return fail(503,'AP_CODE_RECOVERY_UNAVAILABLE')}
  }
  if(path==='/api/activepieces-mcp/synthetic-repair'){
    if(req.method!=='POST')return fail(405,'METHOD_NOT_ALLOWED');
    if(!makerSession(req))return fail(403,'MAKER_REQUIRED');
    if(req.headers?.origin!==new URL(req.url).origin)return fail(403,'ORIGIN_INVALID');
    if(String(req.headers?.['content-type']||'').split(';')[0].trim().toLowerCase()!=='application/json')
      return fail(403,'REPAIR_ADMISSION_INVALID');
    // Cloudflare's API adapter parses application/json before dispatching.
    // Accept its object (and raw JSON in handler contract tests), but never
    // accept arrays, malformed strings, extra fields or oversized payloads.
    let input=req.body;
    if(typeof input==='string'){
      if(input.length>256)return fail(403,'REPAIR_ADMISSION_INVALID');
      try{input=JSON.parse(input)}catch{return fail(403,'REPAIR_ADMISSION_INVALID')}
    }
    if(!input||typeof input!=='object'||Array.isArray(input)||
      Object.getPrototypeOf(input)!==Object.prototype||
      Object.keys(input).length!==1||
      input.approval!=='REPAIR_ORIGINAL_ACTIVEPIECES_SANDBOX_ONCE_20261009'||
      JSON.stringify(input).length>256)return fail(403,'REPAIR_ADMISSION_INVALID');
    try{
      const outcome=await vault(req.env).repairOriginalSandboxOnce();
      return new Response(JSON.stringify({providerId:'activepieces',...outcome,
        productionActivation:false}),{status:200,headers:{
        'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
        'X-Content-Type-Options':'nosniff'
      }});
    }catch{return fail(503,'AP_SANDBOX_REPAIR_UNAVAILABLE')}
  }
  if(path==='/api/activepieces-mcp/synthetic-preflight'){
    if(req.method!=='GET')return fail(405,'METHOD_NOT_ALLOWED');
    if(!makerSession(req))return fail(403,'MAKER_REQUIRED');
    if(req.headers?.origin!==new URL(req.url).origin)return fail(403,'ORIGIN_INVALID');
    try{
      const outcome=await vault(req.env).preflightSyntheticSafely();
      return new Response(JSON.stringify({providerId:'activepieces',...outcome,productionActivation:false}),{
        status:200,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
      });
    }catch{return fail(503,'AP_SANDBOX_PREFLIGHT_UNAVAILABLE')}
  }
  if(path==='/api/activepieces-mcp/synthetic-reconciliation'){
    if(req.method!=='GET')return fail(405,'METHOD_NOT_ALLOWED');
    try{
      const v=await vault(req.env).reconcileSyntheticReadOnly();
      const response={providerId:'activepieces',status:v.status,reason:v.reason||null,
        matchCount:Number.isInteger(v.matchCount)?v.matchCount:null,
        runCount:Number.isInteger(v.runCount)?v.runCount:null,
        markerVerified:v.markerVerified===true,checksumVerified:v.checksumVerified===true,
        cached:v.cached===true,productionActivation:false};
      return new Response(JSON.stringify(response),{status:200,headers:{
        'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
        'X-Content-Type-Options':'nosniff'}});
    }catch{return fail(503,'AP_SYNTHETIC_RECONCILIATION_UNAVAILABLE')}
  }
  if(path==='/api/activepieces-mcp/synthetic-diagnostic'){
    if(req.method!=='GET')return fail(405,'METHOD_NOT_ALLOWED');
    try{
      const v=await vault(req.env).syntheticDiagnosis();
      return new Response(JSON.stringify({providerId:'activepieces',...v,
        productionActivation:false}),{status:200,headers:{
        'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    }catch{return fail(503,'AP_SYNTHETIC_DIAGNOSIS_UNAVAILABLE')}
  }
  if(!session(req))return fail(401,'UNAUTHENTICATED');
  let stub;
  try{stub=vault(req.env)}catch{return fail(503,'ACTIVEPIECES_HANDSHAKE_UNAVAILABLE')}
  if(path==='/api/activepieces-mcp' && req.method==='GET') {
    return page('VAOS — Activepieces MCP commissioning',
      '<p>This initiates a one-time OAuth and read-only MCP tool-discovery test using the Activepieces account you approve.</p>'
      +'<p>The test does not incur an Activepieces action credit, perform a business operation, or retain OAuth tokens.</p>'
      +'<form action="/api/activepieces-mcp/start" method="post"><input type="hidden" name="csrf" value="'+csrfToken(req)+'"><button type="submit" style="font-size:17px;padding:12px 18px">Authorize read-only test</button></form>'
      +'<p><a href="/api/activepieces-mcp/status">View current qualification evidence (JSON)</a></p>'
      +(makerSession(req)
        ?'<form action="/api/activepieces-mcp/enroll/start" method="post"><input type="hidden" name="csrf" value="'+csrfToken(req)+'"><button type="submit">Securely connect for persistent read-only verification</button></form>'
          +'<form action="/api/activepieces-mcp/verify" method="post"><input type="hidden" name="csrf" value="'+csrfToken(req)+'"><button type="submit">Verify stored read-only MCP connection</button></form>'
        :''));

  }
  if(path==='/api/activepieces-mcp/status' && req.method==='GET'){
    const status=await stub.status();
    const connection=await stub.connectionStatus();
    return new Response(JSON.stringify({providerId:'activepieces',mcpServer:'https://cloud.activepieces.com/mcp/platform',
      evidence:status,connection,connected:connection.connected,productionActivation:false}),{
      status:200,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},
    });
  }
  if(path==='/api/activepieces-mcp/verify' && req.method==='POST'){
    if(!makerSession(req))return fail(403,'MAKER_REQUIRED');
    if(!validCsrf(req))return fail(403,'CSRF_INVALID');
    try{
      const outcome=await stub.verifyStoredCredentials();
      return page(outcome.connected?'Activepieces read-only verification passed':'Activepieces read-only verification failed',
        '<p>Verification: '+outcome.status+'. Production routing remains disabled.</p>'
        +'<p><a href="/api/activepieces-mcp/status">Review sanitized evidence</a></p>',outcome.connected?200:502);
    }catch{return fail(503,'ACTIVEPIECES_READBACK_NOT_AVAILABLE')}
  }
  if(['/api/activepieces-mcp/start','/api/activepieces-mcp/enroll/start'].includes(path) && req.method==='POST') {
    // Session authentication is checked above, and the session-bound HMAC
    // proof below is the CSRF authorization for this state-changing POST.
    // Origin / Sec-Fetch-Site are *not* used as correctness gates: reverse
    // proxies and browser navigation modes can report unexpected values.
    // SameSite=Strict session cookie + unguessable per-session form token
    // prevent cross-site request forgery without fragile header comparisons.
    if(!validCsrf(req))return fail(403,'CSRF_INVALID');
    try {
      const persistent=path==='/api/activepieces-mcp/enroll/start';
      if(persistent && !makerSession(req))return fail(403,'MAKER_REQUIRED');
      if(persistent && !(await stub.credentialKeyReady()))return fail(503,'ACTIVEPIECES_VAULT_KEY_UNAVAILABLE');
      const authorizationUrl=await beginActivepiecesAuthorization({
        callbackUrl:'https://vaos.vayushastr.workers.dev/api/activepieces-mcp/callback',
        store:stub,persistCredentials:persistent,
      });
      return Response.redirect(authorizationUrl,303);
    }catch(error){
      const candidate=typeof error?.code==='string'?error.code:'';
      // Only our own fixed machine codes are shown or logged. Never include
      // raw thrown error text, HTTP response bodies, OAuth codes or credentials.
      const reasonCode=/^ACTIVEPIECES_OAUTH_[A-Z0-9_]{4,85}$/.test(candidate)
        ? candidate : 'ACTIVEPIECES_OAUTH_UNEXPECTED_FAILED';
      try {
        await stub.record({status:'FAILED',verifiedAt:new Date().toISOString(),
          reasonCode,readonlyTools:[],productionActivation:false});
      }catch {
        console.warn('VAOS_ACTIVEPIECES_OAUTH_EVIDENCE_WRITE_FAILED');
      }
      console.warn('VAOS_ACTIVEPIECES_OAUTH_SETUP_FAILED',reasonCode);
      return page('Activepieces OAuth setup unavailable',
        '<p>VAOS could not complete OAuth setup. No connection was created.</p>'
        +'<p>Diagnostic: <code>'+reasonCode+'</code></p>'
        +'<a href="/api/activepieces-mcp">Return to commissioning</a>',503);
    }
  }
  return fail(405,'METHOD_NOT_ALLOWED');
}
