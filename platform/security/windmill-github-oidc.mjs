const DENY='WINDMILL_GITHUB_IDENTITY_REJECTED';
const AUDIENCE='vaos-windmill-do-qualification';
const WORKFLOW='vyndivybes/vaos/.github/workflows/windmill-live-do-qualification.yml@refs/heads/main';
const JWKS='https://token.actions.githubusercontent.com/.well-known/jwks';
const failure=()=>Object.assign(new Error(DENY),{code:DENY});

function bytes(value){
  if(typeof value!=='string'||!value||!/^[A-Za-z0-9_-]+$/.test(value))throw failure();
  try{
    const padded=value.replace(/-/g,'+').replace(/_/g,'/');
    return Uint8Array.from(atob(padded.padEnd(Math.ceil(padded.length/4)*4,'=')),x=>x.charCodeAt(0));
  }catch{throw failure()}
}
function parse(encoded){
  try{return JSON.parse(new TextDecoder().decode(bytes(encoded)));}
  catch{throw failure()}
}
const strictCount=v=>/^[1-9][0-9]{0,19}$/.test(String(v??''));
const epoch=v=>Number.isSafeInteger(v)&&v>0;

/** Narrow trust exchange for the isolated Windmill *Durable Object* self-test.
 * Accepts no GitHub PR, workflow from another file, other branch, or
 * arbitrary audiences. This identity has no Windmill execution authority.
 */
export async function verifyWindmillGithubOidc(token,{
  fetchImpl=fetch,now=()=>Math.floor(Date.now()/1000),
}={}){
  try{
    if(typeof token!=='string'||token.length<100||token.length>16000)throw failure();
    const parts=token.split('.');
    if(parts.length!==3||parts.some(v=>!v))throw failure();
    const header=parse(parts[0]);
    if(header?.alg!=='RS256'||typeof header.kid!=='string'||
      !/^[a-zA-Z0-9_-]{5,150}$/.test(header.kid))throw failure();
    const response=await fetchImpl(JWKS,{method:'GET',signal:AbortSignal.timeout(5000)});
    if(!response?.ok)throw failure();
    const data=await response.json();
    const jwk=Array.isArray(data?.keys)?data.keys.find(v=>v.kid===header.kid):null;
    if(!jwk||jwk.kty!=='RSA'||jwk.use!=='sig'||(jwk.alg&&jwk.alg!=='RS256')||
      typeof jwk.n!=='string'||typeof jwk.e!=='string')throw failure();
    const publicKey=await crypto.subtle.importKey('jwk',jwk,{
      name:'RSASSA-PKCS1-v1_5',hash:'SHA-256',
    },false,['verify']);
    const signatureValid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',
      publicKey,bytes(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]));
    if(!signatureValid)throw failure();
    const claims=parse(parts[1]);
    const at=now();
    if(!epoch(at)||claims.iss!=='https://token.actions.githubusercontent.com'||
      claims.aud!==AUDIENCE||claims.repository!=='vyndivybes/vaos'||
      claims.ref!=='refs/heads/main'||claims.event_name!=='push'||
      claims.workflow_ref!==WORKFLOW||
      !strictCount(claims.run_id)||!strictCount(claims.run_attempt)||
      !epoch(claims.exp)||!epoch(claims.iat)||
      claims.exp<=at||claims.iat>at+30||at-claims.iat>300||
      claims.exp-claims.iat>600||
      (claims.nbf!==undefined&&(!epoch(claims.nbf)||claims.nbf>at+30))
    )throw failure();
    return Object.freeze({
      runId:String(claims.run_id),runAttempt:String(claims.run_attempt),
    });
  }catch{
    // No untrusted GitHub or JWKS response data reaches logs or clients.
    throw failure();
  }
}
