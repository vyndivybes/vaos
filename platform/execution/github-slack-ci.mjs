// Governed GitHub Actions visibility for the founder and bounded Slack CI alerts.
// Only GET is allowed on fixed GitHub repository paths. Never accepts Slack
// instructions as workflow code, approvals, or transaction authority.
const GITHUB='https://api.github.com/repos/vyndivybes/vaos/actions/runs?per_page=30';
const CHANNEL='C0C90LK78KA';
const CURSOR='runtime/github-ci/cursor.json';
const FAILURE_PREFIX='runtime/github-ci/failures/';
const HOLD=(reason='GITHUB_SOURCE_UNVERIFIED')=>Object.freeze({status:'HOLD',reason,answer:'VAOS GitHub Actions: HOLD ('+reason+'). The independent GitHub CI readback could not be qualified; no workflow status was inferred.',actionAuthorized:false});
function eligibleRun(x){
  return Number.isSafeInteger(x?.id)&&x.id>0 &&
    typeof x.name==='string'&&x.name.length<=180 &&
    ['queued','waiting','in_progress','completed','requested','pending','action_required'].includes(x.status) &&
    (x.conclusion===null||['success','failure','timed_out','cancelled','neutral','skipped','action_required'].includes(x.conclusion));
}
async function fetchActions(env,fetchImpl){
  const token=env?.VAOS_FEDERATED_GITHUB_TOKEN;
  const headers={Accept:'application/vnd.github+json',
    'X-GitHub-Api-Version':'2022-11-28','User-Agent':'vaos-readonly-ci-observer'};
  const run=async authorized=>fetchImpl(GITHUB,{method:'GET',headers:{
    ...headers,...(authorized?{Authorization:'Bearer '+token}:{})
  },redirect:'error',signal:AbortSignal.timeout(8000)});
  let result;
  try{
    if(typeof token==='string'&&token.length>=8){
      try{result=await run(true)}catch{result=null}
      if(!result||[401,403,404].includes(result.status))result=await run(false);
    }else result=await run(false);
  }catch{throw Error('GITHUB_NETWORK_FAILURE')}
  if(result.status!==200)throw Error('GITHUB_API_HTTP_'+
    ([401,403,404,429,500,502,503].includes(result.status)?result.status:'OTHER'));
  let p;try{p=await result.json()}catch{throw Error('GITHUB_PAYLOAD_INVALID')}
  if(!Array.isArray(p?.workflow_runs))throw Error('GITHUB_PAYLOAD_INVALID');
  return p.workflow_runs.filter(eligibleRun).slice(0,30);
}
export async function readVaosGitHubCi(env,{fetchImpl=fetch}={}){
  try{
    const runs=await fetchActions(env,fetchImpl);
    const failed=runs.filter(x=>x.status==='completed'&&['failure','timed_out'].includes(x.conclusion)).length;
    const running=runs.filter(x=>x.status!=='completed').length;
    const success=runs.filter(x=>x.status==='completed'&&x.conclusion==='success').length;
    const considered=runs.length;
    return Object.freeze({status:'PASS',failed,running,success,considered,actionAuthorized:false,
      answer:'VAOS GitHub Actions read-only: last '+considered+
      ' accessible runs; successful '+success+'; failed/timed-out '+failed+
      '; pending/running '+running+'. This reports CI outcomes only, not production deployment health or release approval. GitHub Actions: https://github.com/vyndivybes/vaos/actions'});
  }catch(error){const code=typeof error?.message==='string'&&/^GITHUB_[A-Z_0-9]+$/.test(error.message)?error.message:'GITHUB_SOURCE_UNVERIFIED';return HOLD(code);}
}
async function persist(store,key,body,options){
  return store.put(key,JSON.stringify(body),{
    ...(options||{}),httpMetadata:{contentType:'application/json'}
  });
}
export async function runHourlyCiAlerts(env,{fetchImpl=fetch,postImpl=fetch,now=()=>Date.now()}={}){
  if(env?.VAOS_GITHUB_SLACK_CONTROL!=='failure-alerts-v1')return {status:'DISABLED',alerted:0,actionAuthorized:false};
  const store=env?.VAOS_ARTIFACTS;
  if(typeof store?.get!=='function'||typeof store?.put!=='function'||
    typeof env?.SLACK_BOT_TOKEN!=='string'||!env.SLACK_BOT_TOKEN.startsWith('xoxb-'))
    return {status:'HOLD',alerted:0,reason:'CI_BINDINGS_UNAVAILABLE',actionAuthorized:false};
  let runs;try{runs=await fetchActions(env,fetchImpl)}catch{
    return {status:'HOLD',alerted:0,reason:'CI_SOURCE_UNAVAILABLE',actionAuthorized:false};
  }
  const failed=runs.filter(x=>x.status==='completed'&&['failure','timed_out'].includes(x.conclusion));
  const ids=failed.map(x=>x.id.toString());
  let prior;
  try{prior=await store.get(CURSOR)}catch{return {status:'HOLD',alerted:0,reason:'CI_CURSOR_READ_FAILED',actionAuthorized:false}}
  if(!prior){
    try{await persist(store,CURSOR,{schema:'vaos.github-ci.cursor.v1',observedFailureIds:ids,updatedAt:new Date(now()).toISOString()})}
    catch{return {status:'HOLD',alerted:0,reason:'CI_CURSOR_WRITE_FAILED',actionAuthorized:false}}
    return {status:'READY',alerted:0,baselined:ids.length,actionAuthorized:false};
  }
  let previous;
  try{previous=JSON.parse(await prior.text());if(!Array.isArray(previous.observedFailureIds))throw Error('cursor');}
  catch{return {status:'HOLD',alerted:0,reason:'CI_CURSOR_INVALID',actionAuthorized:false}}
  const known=new Set(previous.observedFailureIds.filter(x=>typeof x==='string'&&/^\d+$/.test(x)));
  const candidates=failed.filter(x=>!known.has(String(x.id))).slice(0,2);
  let alerted=0, held=false;
  for(const run of candidates){
    const id=String(run.id),key=FAILURE_PREFIX+id+'.json';
    const audit={schema:'vaos.github-ci.alert.v1',id,source:'github-actions',actionAuthorized:false};
    try{
      const attempt=await persist(store,key,{...audit,state:'ADMITTED',at:new Date(now()).toISOString()},
        {onlyIf:new Headers({'If-None-Match':'*'})});
      if(attempt===null){known.add(id);continue}
    }catch{held=true;break}
    // Deliberately withhold workflow names, commits, PR subjects, and source
    // payloads from public Slack channels.
    try{
      const r=await postImpl('https://slack.com/api/chat.postMessage',{
        method:'POST',headers:{Authorization:'Bearer '+env.SLACK_BOT_TOKEN,'Content-Type':'application/json'},
        body:JSON.stringify({channel:CHANNEL,text:'[VAOS] WARNING · github.ci.failed\nA VAOS GitHub Actions workflow failed or timed out. Review the repository Actions dashboard. No deployment, merge, or business action has been authorized.\nSource: https://github.com/vyndivybes/vaos/actions',
        unfurl_links:false,unfurl_media:false,link_names:false}),
        redirect:'error',signal:AbortSignal.timeout(8000)
      });
      if(r.status!==200)throw Error('SLACK_PROVIDER');
      const d=await r.json();
      if(d?.ok!==true||d.channel!==CHANNEL||!/^\d+\.\d+$/.test(d.ts||''))throw Error('SLACK_READBACK');
      await persist(store,key,{...audit,state:'SENT',replyTs:d.ts,at:new Date(now()).toISOString()});
      alerted++;
    }catch{
      // The send may have succeeded; never retry blindly.
      try{await persist(store,key,{...audit,state:'HOLD',reason:'DELIVERY_UNCERTAIN',at:new Date(now()).toISOString()})}catch{}
      held=true;
    }
    known.add(id);
  }
  try{await persist(store,CURSOR,{schema:'vaos.github-ci.cursor.v1',
    observedFailureIds:[...new Set([...known,...ids])].slice(-100),
    updatedAt:new Date(now()).toISOString()})}
  catch{return {status:'HOLD',alerted,reason:'CI_CURSOR_WRITE_FAILED',actionAuthorized:false}}
  return {status:held?'HOLD':'PASS',alerted,actionAuthorized:false};
}
