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
    // Start and finish are sent once. Status is read-only and safe to poll.
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
  let alarmObserved=false;
  for(let poll=0;poll<16;poll++){
    await nap(5000);
    const state=await phase('status');
    if(state?.status==='ALARM_OBSERVED'&&state.alarmObserved===true){
      alarmObserved=true;break;
    }
    if(state?.status!=='WAITING'||state.alarmObserved!==false)
      throw fail('CLOUDFLARE_ALARM_STATUS_INVALID');
  }
  if(!alarmObserved)throw fail('CLOUDFLARE_ALARM_CALLBACK_NOT_OBSERVED');
  // Deliberately abort the isolated Durable Object instance exactly once.
  // Cloudflare returns a runtime error (non-200) and forcibly recreates the
  // instance on its next call. Neither POST nor job dispatch is retried.
  try{
    await fetch(ORIGIN+PATH,{
      method:'POST',redirect:'error',
      headers:{Authorization:'Bearer '+oidc,'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify({phase:'restart'}),
      signal:AbortSignal.timeout(20000),
    });
  }catch{
    // Connection teardown by ctx.abort is expected. Not proof of success.
  }
  let restartProof=null;
  for(let probe=0;probe<16;probe++){
    await nap(4000);
    let candidate;
    try{candidate=await phase('restart-status');}
    catch(e){
      if(probe===15)throw e;
      continue;
    }
    if(candidate?.status==='RESTART_VERIFIED'&&
      candidate.instanceChanged===true&&
      candidate.sameDurableObject===true&&
      candidate.previouslyReservedSlotStillBlocked===true&&
      candidate.providerDispatchCount===0){
      restartProof=candidate;break;
    }
    if(candidate?.status!=='WAITING')throw fail('CLOUDFLARE_RESTART_PROOF_INVALID');
  }
  if(!restartProof)throw fail('CLOUDFLARE_RESTART_INSTANCE_NOT_CHANGED');
  const end=await phase('finish');
  if(end?.status!=='PASS'||end.persistedAcrossRequests!==true||
     end.blockedWhileQuarantined!==true||end.quarantined!==true||
     end.auditCount!==3||end.alarmObserved!==true||end.restartEvictionVerified!==false||
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
    cloudflareAlarmCallback:'PASS',
    auditEvents:end.auditCount,
    windmillCalls:0,
    liveWindmillCancellationQualified:false,
    actualDurableObjectEvictionQualified:true,
    productionActivation:false,
  };
  fs.writeFileSync('qualification-evidence/windmill/cloudflare-do-live.json',
    JSON.stringify(evidence,null,2)+'\n',{mode:0o600});
  fs.writeFileSync('qualification-evidence/windmill/cloudflare-restart.json',JSON.stringify({
    schemaVersion:'vaos.windmill.restart-recovery.v1',
    status:'PASS',instanceChanged:true,sameDurableObject:true,
    previouslyReservedSlotStillBlocked:true,providerDispatchCount:0,
    evidenceRunId:String(process.env.GITHUB_RUN_ID),
    sourceCommit:String(process.env.GITHUB_SHA),
    method:'cloudflare.ctx.abort',
    productionActivation:false,
  },null,2)+'\\n',{mode:0o600});
  console.log('PASS: genuine isolated Durable Object abort/reinstantiation, preserved fencing and alarm evidence. Windmill routing disabled.');
}
try{await main();}
catch(e){
  const code=typeof e?.code==='string'&&/^[A-Z0-9_]+$/.test(e.code)
    ?e.code:'WINDMILL_LIVE_DO_QUALIFICATION_FAILED';
  console.error('::error::'+code);
  process.exitCode=1;
}
