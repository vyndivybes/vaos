// Strictly one qualified read-only Windmill ping. No business effects or arbitrary code.
export const WINDMILL_SCOPED_SCRIPT='f/vaos/qualification_ping';
const BASE='https://app.windmill.dev';
const WORKSPACE='vaos';
const fail=code=>Object.assign(new Error(code),{code,retryable:false});
const protectedText=value=>typeof value==='string'&&value.trim().length>0;
const age=(date,now)=>{const ms=Date.parse(date||'');return Number.isFinite(ms)?now.getTime()-ms:Infinity;};
const jobId=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9-]{1,79}$/.test(value);
const providerRunId=value=>typeof value==='string'&&/^[a-zA-Z0-9-]{8,90}$/.test(value);
const challengeOk=value=>typeof value==='string'&&/^[a-f0-9]{32}$/.test(value);

export function inspectScopedWindmill({env={},provider,status,now=new Date()}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw fail('WINDMILL_SCOPED_CLOCK_INVALID');
 const blocks=[];
 if(env.WINDMILL_KILL_SWITCH==='true')blocks.push('KILL_SWITCH');
 if(env.WINDMILL_SCOPED_ENABLED!=='owner-approved-20261010')blocks.push('OWNER_SCOPE_NOT_ACTIVATED');
 if(env.WINDMILL_ADMISSION_ENABLED!=='true')blocks.push('DURABLE_ADMISSION_DISABLED');
 if(env.WINDMILL_BASE_URL!==BASE||env.WINDMILL_WORKSPACE!==WORKSPACE)blocks.push('PROVIDER_ENDPOINT_INVALID');
 if(!protectedText(env.WINDMILL_DISPATCH_TOKEN)||!protectedText(env.WINDMILL_VERIFY_TOKEN)
   ||env.WINDMILL_DISPATCH_TOKEN===env.WINDMILL_VERIFY_TOKEN)blocks.push('DISTINCT_CREDENTIALS_NOT_CONFIGURED');
 if(provider?.providerId!=='windmill'||provider.enabled!==true
   ||provider.capabilityEnabled?.['code.execute']!==true
   ||provider.qualification?.state!=='qualified'
   ||!provider.qualification.qualifiedCapabilities?.includes('code.execute')
   ||!(age(provider.qualification.validUntil,now)<0))
   blocks.push('PROVIDER_NOT_ACTIVATED_AND_QUALIFIED');
 const checkedAge=age(provider?.health?.checkedAt,now);
 if(provider?.health?.status!=='healthy'||checkedAge<0||checkedAge>300000)
   blocks.push('PROVIDER_HEALTH_NOT_FRESH');
 if(status?.schemaVersion!=='vaos.windmill.durable-admission.v1'
   ||status.maxConcurrentRuns!==1||status.queuedRuns!==0
   ||status.productionActivation!==false||status.active!==null)
   blocks.push('GLOBAL_ADMISSION_NOT_EMPTY');
 return Object.freeze({ready:blocks.length===0,blocks:Object.freeze(blocks),
   scriptPath:WINDMILL_SCOPED_SCRIPT,maxConcurrentRuns:1,
   businessWritesAllowed:false,retriesAllowed:false});
}

function randomChallenge(){
 const arr=new Uint8Array(16);
 crypto.getRandomValues(arr);
 return Array.from(arr,x=>x.toString(16).padStart(2,'0')).join('');
}
function randomJobId(){return 'windmill-scoped-'+crypto.randomUUID();}

export async function runScopedWindmillPing({
 env,provider,admission,transport,now=()=>new Date(),
 makeChallenge=randomChallenge,makeJobId=randomJobId,
}={}){
 // Reject kill switch before looking at ANY external resource.
 if(!env||env.WINDMILL_KILL_SWITCH==='true'
   ||env.WINDMILL_SCOPED_ENABLED!=='owner-approved-20261010'
   ||env.WINDMILL_ADMISSION_ENABLED!=='true')
   throw fail('WINDMILL_SCOPED_HOLD');
 if(!admission||!transport||typeof admission.status!=='function'
   ||typeof admission.reserve!=='function'
   ||typeof admission.beginDispatch!=='function'
   ||typeof admission.recordProviderRun!=='function'
   ||typeof admission.finish!=='function'
   ||typeof transport.runScript!=='function'||typeof transport.waitForJob!=='function')
   throw fail('WINDMILL_SCOPED_PORT_MISSING');
 const current=now();
 const snapshot=await admission.status();
 const readiness=inspectScopedWindmill({env,provider,status:snapshot,now:current});
 if(!readiness.ready)throw fail('WINDMILL_SCOPED_HOLD');
 const challenge=makeChallenge();
 const localJobId=makeJobId();
 if(!challengeOk(challenge)||!jobId(localJobId))throw fail('WINDMILL_SCOPED_CHALLENGE_INVALID');

 const slot=await admission.reserve({
   jobId:localJobId,scriptPath:WINDMILL_SCOPED_SCRIPT,
   authorityRef:'qualification:manual-approved',approvedAction:true,
   maxRuntimeSeconds:60,productionEnabled:false,
 });
 if(slot?.status!=='GRANTED'||!Number.isSafeInteger(slot.epoch)||slot.epoch<1)
   throw fail('WINDMILL_SCOPED_ADMISSION_REJECTED');
 const fence={jobId:localJobId,epoch:slot.epoch};
 await admission.beginDispatch(fence);
 // Single POST. Any timeout / unknown result retains the durable admission slot
 // for independent reconciliation. No catch block may retry or release it.
 const url=BASE+'/api/w/'+WORKSPACE+'/jobs/run/p/'+WINDMILL_SCOPED_SCRIPT;
 const response=await transport.runScript({
   url,method:'POST',timeoutMs:15000,
   headers:{Authorization:'Bearer '+env.WINDMILL_DISPATCH_TOKEN,
     'Content-Type':'application/json',Accept:'text/plain'},
   body:{challenge},
 });
 if(![200,201].includes(response?.status)||!providerRunId(response?.body))
   throw fail('WINDMILL_SCOPED_DISPATCH_UNVERIFIED');
 const remoteId=response.body;
 await admission.recordProviderRun({...fence,providerRunId:remoteId});
 const verification=await transport.waitForJob({
   url:BASE+'/api/w/'+WORKSPACE+'/jobs_u/get/'+encodeURIComponent(remoteId),
   jobId:remoteId,
   headers:{Authorization:'Bearer '+env.WINDMILL_VERIFY_TOKEN,Accept:'application/json'},
 });
 if(verification?.id!==remoteId||verification?.script_path!==WINDMILL_SCOPED_SCRIPT
   ||verification.success!==true
   ||verification?.result?.qualification!=='VAOS_WINDMILL_SYNTHETIC_V1'
   ||verification?.result?.challenge!==challenge)
   throw fail('WINDMILL_SCOPED_READBACK_UNVERIFIED');

 const finish=await admission.finish({
   ...fence,providerRunId:remoteId,verified:true,
   verificationSource:'windmill.api.job-readback',
   evidenceRef:'windmill:job:'+remoteId,terminalState:'SUCCEEDED',
 });
 if(finish?.status!=='RELEASED')throw fail('WINDMILL_SCOPED_RELEASE_UNVERIFIED');
 return Object.freeze({status:'PASS',providerId:'windmill',
   scriptPath:WINDMILL_SCOPED_SCRIPT,providerJobId:remoteId,
   independentProviderReadback:true,maxConcurrentRuns:1,
   businessWritesAllowed:false,automaticRetry:false});
}
