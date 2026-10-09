const fail=code=>Object.assign(new Error(code),{code,retryable:false});
const read64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
const json64=s=>JSON.parse(new TextDecoder().decode(read64(s)));
const TRUSTED=Object.freeze({
  issuer:'https://token.actions.githubusercontent.com',audience:'vaos-stirling-cloud-qualification',
  repository:'vyndivybes/vaos',repositoryId:'1407793546',
  workflow:'vyndivybes/vaos/.github/workflows/stirling-cloud-qualification.yml@refs/heads/main',
});
export async function verifyGitHubQualificationOidc(jwt,{fetchImpl=globalThis.fetch,now=()=>Date.now()}={}){
  if(typeof jwt!=='string'||jwt.length>12000||jwt.length<100)throw fail('STIRLING_GITHUB_IDENTITY_DENIED');
  const parts=jwt.split('.');
  if(parts.length!==3||parts.some(p=>!/^[A-Za-z0-9_-]+$/.test(p)))throw fail('STIRLING_GITHUB_IDENTITY_DENIED');
  let header,claims;
  try{header=json64(parts[0]);claims=json64(parts[1])}catch{throw fail('STIRLING_GITHUB_IDENTITY_DENIED')}
  if(header?.alg!=='RS256'||typeof header.kid!=='string'||header.kid.length>200)
    throw fail('STIRLING_GITHUB_IDENTITY_DENIED');
  const t=Math.floor(now()/1000);
  if(claims?.iss!==TRUSTED.issuer||claims.aud!==TRUSTED.audience||
    claims.repository!==TRUSTED.repository||String(claims.repository_id)!==TRUSTED.repositoryId||
    claims.ref!=='refs/heads/main'||claims.event_name!=='push'||
    claims.workflow_ref!==TRUSTED.workflow||
    claims.sub!=='repo:vyndivybes/vaos:ref:refs/heads/main'||
    !Number.isFinite(claims.exp)||claims.exp<=t||claims.exp>t+300||
    !Number.isFinite(claims.iat)||claims.iat>t+30||claims.iat<t-300||
    (claims.nbf!==undefined&&(!Number.isFinite(claims.nbf)||claims.nbf>t+30))){
      throw fail('STIRLING_GITHUB_IDENTITY_DENIED');
  }
  let keys;
  try{
    const r=await fetchImpl('https://token.actions.githubusercontent.com/.well-known/jwks',{redirect:'error',signal:AbortSignal.timeout(9000)});
    if(r.status!==200)throw Error('jwks error');
    const data=await r.text();
    if(data.length>50000)throw Error('jwks too large');
    keys=JSON.parse(data)?.keys;
  }catch{throw fail('STIRLING_GITHUB_JWKS_UNAVAILABLE')}
  const jwk=Array.isArray(keys)?keys.find(k=>k.kid===header.kid&&k.kty==='RSA'):null;
  if(!jwk)throw fail('STIRLING_GITHUB_KEY_UNKNOWN');
  let valid=false;
  try{
    const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,read64(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]));
  }catch{throw fail('STIRLING_GITHUB_SIGNATURE_INVALID')}
  if(!valid)throw fail('STIRLING_GITHUB_SIGNATURE_INVALID');
  return Object.freeze({repository:TRUSTED.repository,runId:String(claims.run_id||''),sha:String(claims.sha||'')});
}
