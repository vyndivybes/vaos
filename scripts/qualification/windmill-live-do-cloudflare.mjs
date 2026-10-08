import fs from 'node:fs';

const ORIGIN='https://vaos.vayushastr.workers.dev';
const PATH='/api/windmill-live-do-qualification';
const AUDIENCE='vaos-windmill-do-qualification';
const fail=code=>Object.assign(new Error(code),{code});
const nap=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function main(){
  if(process.env.GITHUB_EVENT_NAME!=='push'||
     process.env.GITHUB_REF!=='refs/heads/main'||
     process.env.GITHUB_REPOSITORY!=='vyndivybes/vaos')
    throw fail('GITHUB_WORKFLOW_SCOPE_INVALID');
  if(!process.env.ACTIONS_ID_TOKEN_REQUEST_URL||
     !process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN)
    throw fail('GITHUB_OIDC_NOT_AVAILABLE');
  // Wait for Cloudflare's separately managed deployment to expose this exact
  // new route. GET performs NO state mutation and requires no bearer token.
  let ready=false;
  for(let attempt=0;attempt<36;attempt++){
    try{
      const response=await fetch(ORIGIN+PATH,{
        method:'GET',redirect:'error',signal:AbortSignal.timeout(10000),
      });
      if(response.status===405){ready=true;break;}
    }catch{}
    if(attempt<35)await nap(10000);
  }
  if(!ready)throw fail('CLOUDFLARE_NEW_ROUTE_NOT_DEPLOYED');

  const endpoint=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
  endpoint.searchParams.set('audience',AUDIENCE);
  const identity=await fetch(endpoint.toString(),{
    method:'GET',redirect:'error',
    headers:{Authorization:'Bearer '+process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN},
    signal:AbortSignal.timeout(10000),
  });
  if(!identity.ok)throw fail('GITHUB_OIDC_ISSUANCE_FAILED');
  const oidc=(await identity.json())?.value;
  if(typeof oidc!=='string'||oidc.length<100)throw fail('GITHUB_OIDC_INVALID');

  async function phase(value){
    // Exactly one POST for each distinct phase. Never retry an ambiguous POST.
    const response=await fetch(ORIGIN+PATH,{
      method:'POST',redirect:'error',
      headers:{Authorization:'Bearer '+oidc,'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify({phase:value}),
      signal:AbortSignal.timeout(20000),
    });
    if(response.status!==200)throw fail('CLOUDFLARE_QUALIFICATION_HTTP_'+response.status);
    const data=(await response.json())?.data;
    if(data?.productionActivation!==false||data?.windmillCalls!==0)
      throw fail('CLOUDFLARE_DRILL_SAFETY_MISMATCH');
    return data;
  }
  const start=await phase('start');
  if(start?.status!=='STARTED'||start.admission!=='PASS'||
     start.blockedCompetingJob!==true||start.auditCount!==2)
    throw fail('CLOUDFLARE_DRILL_START_FAILED');
  await nap(3000);
  const end=await phase('finish');
  if(end?.status!=='PASS'||end.persistedAcrossRequests!==true||
     end.blockedWhileQuarantined!==true||end.quarantined!==true||
     end.auditCount!==3||end.restartEvictionVerified!==false||
     end.cancellationVerified!==false)
    throw fail('CLOUDFLARE_DRILL_FINISH_FAILED');

  fs.mkdirSync('qualification-evidence/windmill',{recursive:true});
  const evidence={
    schemaVersion:'vaos.windmill.cloud-do-live.v1',
    qualification:'PASS',
    githubRunId:String(process.env.GITHUB_RUN_ID),
    githubRunAttempt:String(process.env.GITHUB_RUN_ATTEMPT),
    sourceCommit:String(process.env.GITHUB_SHA),
    cloudflareAuthenticatedBy:'github-oidc-rs256-scoped',
    concurrentAdmission:'PASS',
    persistedAcrossHttpRequests:'PASS',
    timeoutQuarantine:'PASS',
    auditEvents:end.auditCount,
    windmillCalls:0,
    liveWindmillCancellationQualified:false,
    actualDurableObjectEvictionQualified:false,
    productionActivation:false,
  };
  fs.writeFileSync('qualification-evidence/windmill/cloudflare-do-live.json',
    JSON.stringify(evidence,null,2)+'\n',{mode:0o600});
  console.log('PASS: signed Cloudflare isolated Durable Object admission, persistence, quarantine and audit drill. Windmill production routing unchanged.');
}
try{await main();}
catch(e){
  const code=typeof e?.code==='string'&&/^[A-Z0-9_]+$/.test(e.code)
    ?e.code:'WINDMILL_LIVE_DO_QUALIFICATION_FAILED';
  console.error('::error::'+code);
  process.exitCode=1;
}
