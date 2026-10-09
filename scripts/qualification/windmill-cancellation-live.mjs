import fs from 'node:fs';
import {randomBytes} from 'node:crypto';
import {createGovernedHttpTransport} from '../../platform/execution/governed-http-transport.mjs';
import {createWindmillCancellationController} from '../../integrations/windmill/cancellation-controller.mjs';
const fail=code=>Object.assign(new Error(code),{code});
const required=k=>{const v=process.env[k];if(typeof v!=='string'||!v.trim())throw fail('WINDMILL_CANCELLATION_CONFIG_MISSING');return v.trim();};
const SCRIPT='f/vaos/qualification_hold';
const ENDPOINT='https://vaos.vayushastr.workers.dev/api/windmill-live-do-qualification';
async function main(){
 if(process.env.GITHUB_REPOSITORY!=='vyndivybes/vaos'||process.env.GITHUB_REF!=='refs/heads/main'||process.env.GITHUB_EVENT_NAME!=='workflow_dispatch'||process.env.WINDMILL_CANCELLATION_CONFIRM!=='RUN_ONE_CANCELLATION')
  throw fail('WINDMILL_CANCELLATION_NOT_AUTHORIZED');
 const dispatchToken=required('WINDMILL_HOLD_DISPATCH_TOKEN'),cancelToken=required('WINDMILL_HOLD_CANCEL_TOKEN'),readToken=required('WINDMILL_HOLD_READ_TOKEN');
 if(new Set([dispatchToken,cancelToken,readToken]).size!==3)throw fail('WINDMILL_CANCELLATION_IDENTITY_SEPARATION_REQUIRED');
 const response=await fetch(required('ACTIONS_ID_TOKEN_REQUEST_URL')+'&audience=vaos-windmill-cancellation-qualification',{
  headers:{Authorization:'Bearer '+required('ACTIONS_ID_TOKEN_REQUEST_TOKEN')},signal:AbortSignal.timeout(10000),redirect:'manual'});
 if(!response.ok)throw fail('WINDMILL_CANCELLATION_OIDC_UNAVAILABLE');
 const identity=(await response.json()).value;
 if(typeof identity!=='string'||identity.length<100)throw fail('WINDMILL_CANCELLATION_OIDC_INVALID');
 const http=createGovernedHttpTransport({allowedOrigins:['https://vaos.vayushastr.workers.dev','https://app.windmill.dev'],maxRequestBytes:18000,maxResponseBytes:65536});
 const call=async(phase,extra={})=>{
  const r=await http.request({url:ENDPOINT,method:'POST',headers:{Authorization:'Bearer '+identity},body:{phase:'cancellation-'+phase,...extra},timeoutMs:8000});
  if(r.status!==200||r.body?.data?.productionActivation!==false)throw fail('WINDMILL_CANCELLATION_ADMISSION_UNAVAILABLE');
  return r.body.data;
 };
 const capability=await call('capabilities');
 if(capability.status!=='CANCELLATION_DRILL_READY')throw fail('WINDMILL_CANCELLATION_DEPLOYMENT_NOT_READY');
 const reservation=await call('start');
 if(reservation.status!=='GRANTED'||reservation.maxConcurrentRuns!==1||reservation.queuedRuns!==0||reservation.deadlineMs>Date.now()+60000)throw fail('WINDMILL_CANCELLATION_RESERVATION_INVALID');
 // Exactly one POST. A missing/unknown acknowledgment leaves the durable slot occupied.
 const dispatch=await http.request({url:'https://app.windmill.dev/api/w/vaos/jobs/run/p/'+SCRIPT,method:'POST',headers:{Authorization:'Bearer '+dispatchToken},
  body:{challenge:randomBytes(16).toString('hex')},timeoutMs:8000});
 const jobId=typeof dispatch.body==='string'?dispatch.body.trim():dispatch.body?.id;
 if(![200,201,202].includes(dispatch.status)||typeof jobId!=='string'||!/^[A-Za-z0-9-]{8,90}$/.test(jobId))throw fail('WINDMILL_CANCELLATION_DISPATCH_OUTCOME_UNKNOWN');
 await call('bind',{providerJobId:jobId});
 const controller=createWindmillCancellationController({httpTransport:http,beforeCancel:async()=>{const r=await call('cancel',{providerJobId:jobId});if(r.status!=='CANCEL_AUTHORIZED')throw fail('WINDMILL_CANCELLATION_CANCEL_NOT_ADMITTED');}});
 const proof=await controller.cancelAndVerify({providerRunId:jobId,scriptPath:SCRIPT,authorizationRef:'qualification:operator-approved',token:cancelToken,readToken});
 const released=await call('finish',{providerJobId:jobId,canceled:true,success:false});
 if(released.status!=='RELEASED')throw fail('WINDMILL_CANCELLATION_RELEASE_UNVERIFIED');
 const evidence={schemaVersion:'vaos.windmill.cancellation-drill.v1',providerId:'windmill',status:'PASS',scriptPath:SCRIPT,jobId,providerJobId:jobId,
  providerScriptHash:'92dd4d9b9bff2d1d',terminalState:'CANCELLED',independentReadback:true,runningBeforeCancellation:proof.runningBeforeCancellation,cancelPostAttemptCount:proof.cancelPostAttemptCount,
  dispatchPostAttemptCount:1,distinctCredentialRoles:true,sourceCommitSha:required('GITHUB_SHA'),evidenceRunId:required('GITHUB_RUN_ID'),productionActivation:false,
  reservation:{durable:true,maxConcurrentRuns:1,queuedRuns:0,expirySeconds:60,released:true},verifiedAt:new Date().toISOString()};
 fs.mkdirSync('qualification-evidence/windmill',{recursive:true});
 fs.writeFileSync('qualification-evidence/windmill/cancellation-live.json',JSON.stringify(evidence,null,2)+'\n',{mode:0o600});
 console.log('PASS: one bounded Windmill job observed running, cancelled once, terminal state verified by separate read-only credential; durable isolated slot released. Routing remains disabled.');
}
try{await main()}catch(error){const code=/^WINDMILL_[A-Z0-9_]+$/.test(error?.code||'')?error.code:'WINDMILL_CANCELLATION_LIVE_FAILED';console.error('::error::'+code);process.exitCode=1;}
