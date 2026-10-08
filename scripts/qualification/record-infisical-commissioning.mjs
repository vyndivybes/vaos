import fs from 'node:fs';
const required=name=>{const value=process.env[name];if(!value)throw Error('missing env: '+name);return value};
const action=required('INFISICAL_COMMISSION_ACTION');
if(!['record-health','disable'].includes(action))throw Error('INFISICAL_COMMISSION_ACTION_FORBIDDEN');

const runId=required('GITHUB_RUN_ID');
const repository=required('GITHUB_REPOSITORY');
if(repository!=='vyndivybes/vaos'||!/^[0-9]+$/.test(runId))
  throw Error('INFISICAL_COMMISSION_GITHUB_CONTEXT_INVALID');
const authorityRef='https://github.com/'+repository+'/actions/runs/'+runId;
let health=null;
if(action==='record-health'){
  const evidence=JSON.parse(fs.readFileSync('qualification-evidence/provider-wave-2/infisical.json','utf8'));
  const checks=['universal-auth-login','allowed-secret-read','denied-scope-read','token-ttl-bounded',
    'credential-broker-integration','secret-value-nondisclosure','health-and-expiry','kill-switch'];
  const byId=new Map((evidence.checks||[]).map(x=>[x.checkId,x.outcome]));
  if(evidence.providerId!=='infisical'||evidence.capability!=='secret.broker'||
     evidence.productionActivation!==false||evidence.source?.runId!==runId||
     evidence.source?.runUrl!==authorityRef||checks.some(x=>byId.get(x)!=='pass'))
    throw Error('INFISICAL_COMMISSION_LIVE_EVIDENCE_INVALID');
  health={status:'healthy',checkedAt:new Date().toISOString(),evidenceRef:authorityRef};
}else{
  if(process.env.INFISICAL_DISABLE_CONFIRM!=='DISABLE-ONLY')
    throw Error('INFISICAL_DISABLE_CONFIRMATION_REQUIRED');
}
const config=JSON.parse(fs.readFileSync('wrangler.jsonc','utf8'));
const url=process.env.SUPABASE_URL||config.vars?.SUPABASE_URL;
if(!url||!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url))
  throw Error('INFISICAL_COMMISSION_DATABASE_URL_INVALID');
const key=required('VAOS_INFISICAL_COMMISSIONING_KEY');
const response=await fetch(url+'/functions/v1/vaos-control',{
  method:'POST',
  headers:{'x-vaos-server-key':key,'Content-Type':'application/json','Cache-Control':'no-store'},
  body:JSON.stringify({operation:'infisicalCommissioningControl',
    payload:{action,health,authorityRef}})
});
if(!response.ok)throw Error('INFISICAL_COMMISSION_RPC_FAILED:HTTP_'+response.status);
const result=await response.json();
if(result?.outcome!=='SAVED'||result.providerId!=='infisical'||
   result.enabled!==false||!['record-health','disable'].includes(result.operation))
  throw Error('INFISICAL_COMMISSION_STATE_READBACK_FAILED');
if(action==='record-health'&&(result.qualificationState!=='qualified'||result.health?.status!=='healthy'))
  throw Error('INFISICAL_COMMISSION_HEALTH_NOT_PERSISTED');
console.log(JSON.stringify({providerId:'infisical',action:result.operation,
  enabled:result.enabled,qualificationState:result.qualificationState,
  healthStatus:result.health?.status||null,authorityRef},null,2));
