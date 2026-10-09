// Strict single-attempt Activepieces sandbox flow qualification.
// One isolated draft, one test run, no publish, no schedule, no third-party writes.
const REQUIRED=['ap_build_flow','ap_test_flow','ap_get_run','ap_list_runs'];
const err=code=>Object.assign(new Error(code),{code});
const parse=(r)=>{
  if(!r||r.isError===true)throw err('AP_TOOL_ERROR');
  if(r.structuredContent&&typeof r.structuredContent==='object')return r.structuredContent;
  if(Array.isArray(r.content)){
    const txt=r.content.filter(x=>x.type==='text').map(x=>x.text).join('\n');
    if(txt.length>180000)throw err('AP_TOOL_TOO_LARGE');
    try{return JSON.parse(txt)}catch{throw err('AP_TOOL_RESULT_INVALID')}
  }
  return r;
};
const id=(o,keys)=>keys.map(k=>k.split('.').reduce((v,p)=>v?.[p],o)).find(v=>typeof v==='string'&&/^[A-Za-z0-9_-]{6,120}$/.test(v))||null;
const SHA=async v=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(v))))).map(x=>x.toString(16).padStart(2,'0')).join('');
export async function auditAppend(store,event,extra={}){
  const events=await store.get('ap-qual-audit')||[];
  if(events.length>25)throw err('AP_AUDIT_LIMIT');
  const row={seq:events.length+1,time:new Date().toISOString(),event,
    detail:Object.fromEntries(Object.entries(extra).filter(([k,v])=>['phase','reason','outcome','flowId','runId'].includes(k)&&typeof v==='string')),
    previous:events.at(-1)?.hash||'GENESIS'};
  const next={...row,hash:await SHA(row)};
  await store.put('ap-qual-audit',[...events,next]);return next;
}
export async function auditValidate(store){
  const rows=await store.get('ap-qual-audit')||[];let prior='GENESIS';
  for(let i=0;i<rows.length;i++){const {hash,...row}=rows[i];
    if(row.seq!==i+1||row.previous!==prior||await SHA(row)!==hash)return {ok:false,count:rows.length};
    prior=hash;
  }
  return {ok:true,count:rows.length,head:prior};
}
export async function qualifyEvidence(store){
  const s=await store.get('ap-qual-state');
  return {status:s?.status||'NOT_STARTED',phase:s?.phase||null,reason:s?.reason||null,
    flowId:s?.flowId||null,runId:s?.runId||null,checksumVerified:s?.checksumVerified===true,
    markerVerified:s?.markerVerified===true,productionActivation:false,audit:await auditValidate(store)};
}
const persist=async(store,state,event)=>{await store.put('ap-qual-state',state);
  await auditAppend(store,event,{phase:state.phase,reason:state.reason||undefined,flowId:state.flowId||undefined,runId:state.runId||undefined});
};
const CHECKSUM=45;
function assessRun(payload,flowId,runId,marker){
  const r=parse(payload),txt=JSON.stringify(r),s=r.status||r.run?.status||r.flowRun?.status||r.data?.status,
    fid=r.flowId||r.run?.flowId||r.flowRun?.flowId||r.data?.flowId,
    rid=r.id||r.flowRunId||r.run?.id||r.flowRun?.id||r.data?.id;
  return {ok:['SUCCEEDED','SUCCESS','COMPLETED'].includes(String(s||'').toUpperCase())&&
    (!fid||fid===flowId)&&(!rid||rid===runId)&&txt.includes(marker)&&txt.includes('"checksum":45')&&txt.includes('VAOS_SANDBOX_V1'),
    markerVerified:txt.includes(marker),checksumVerified:txt.includes('"checksum":45')};
}
export async function qualifyOnce({store,client,makeMarker,resumeRemediation=false}){
  const previous=await store.get('ap-qual-state');
  if(previous && !resumeRemediation)return qualifyEvidence(store);
  if(resumeRemediation && !(previous?.status==='HOLD'&&previous?.phase==='BUILD_SUBMITTED'
    && await store.get('ap-qual-remediation-admitted')===true))
    return qualifyEvidence(store);
  const marker=resumeRemediation?previous.marker:makeMarker();
  if(!/^VAOSQ_[0-9A-F]{16}$/.test(marker))throw err('AP_MARKER_INVALID');
  let state={status:'IN_PROGRESS',phase:'ADMITTED',reason:null,marker,flowId:null,runId:null};
  await persist(store,state,'ADMITTED');
  try{
    const available=new Set((await client.tools()).map(x=>typeof x==='string'?x:x?.name));
    if(REQUIRED.some(x=>!available.has(x))){
      state={...state,status:'HOLD',phase:'CAPABILITY_GATE',reason:'AP_REQUIRED_TOOLS_DISABLED'};
      await persist(store,state,'HOLD');return qualifyEvidence(store);
    }
    state={...state,phase:'BUILD_SUBMITTED'};await persist(store,state,'BUILD_ADMITTED');
    const built=parse(await client.call('ap_build_flow',{
      flowName:'VAOS Synthetic Qualification '+marker,
      trigger:{pieceName:'@activepieces/piece-webhook',triggerName:'catch_webhook',input:{}},
      steps:[{type:'CODE',displayName:'Deterministic checksum',
        sourceCode:"export const code = async (inputs) => ({qualMarker:inputs.qualMarker,checksum:Number(inputs.value)*7+3,fixtureType:'VAOS_SANDBOX_V1'});",
        input:{qualMarker:'{{trigger.body.qualMarker}}',value:'{{trigger.body.value}}'},
        continueOnFailure:false,retryOnFailure:false}],
    }));
    const flowId=id(built,['flowId','flow.id','data.flowId','data.flow.id']);
    if(!flowId){
      state={...state,status:'HOLD',phase:'BUILD_UNKNOWN',reason:'AP_BUILD_ID_UNKNOWN'};
      await persist(store,state,'HOLD');return qualifyEvidence(store);
    }
    state={...state,flowId,phase:'BUILT'};await persist(store,state,'BUILT');
    // Admission is persisted BEFORE test submission. Crashes never blindly retry.
    state={...state,phase:'TEST_SUBMITTED'};await persist(store,state,'TEST_ADMITTED');
    const test=parse(await client.call('ap_test_flow',{flowId,
      displayName:'VAOS Synthetic Only',triggerTestData:{body:{qualMarker:marker,value:6}}}));
    const runId=id(test,['flowRunId','runId','flowRun.id','run.id','data.flowRunId','data.id','id']);
    if(!runId){
      state={...state,status:'HOLD',phase:'TEST_UNKNOWN',reason:'AP_RUN_ID_UNKNOWN'};
      await persist(store,state,'HOLD');return qualifyEvidence(store);
    }
    state={...state,runId,phase:'RUN_RECORDED'};await persist(store,state,'RUN_RECORDED');
    const readback=assessRun(await client.call('ap_get_run',{flowRunId:runId}),flowId,runId,marker);
    if(!readback.ok){
      state={...state,status:'HOLD',phase:'READBACK_MISMATCH',reason:'AP_RUN_EVIDENCE_MISMATCH',...readback};
      await persist(store,state,'HOLD');return qualifyEvidence(store);
    }
    const listed=parse(await client.call('ap_list_runs',{flowId,limit:15}));
    if(!JSON.stringify(listed).includes(runId)){
      state={...state,status:'HOLD',phase:'LIST_RUNS_MISMATCH',reason:'AP_RUN_NOT_LISTED'};
      await persist(store,state,'HOLD');return qualifyEvidence(store);
    }
    state={...state,status:'PASS',phase:'INDEPENDENT_READBACK_PASS',
      markerVerified:true,checksumVerified:true};
    await persist(store,state,'PASS');return qualifyEvidence(store);
  }catch(e){
    state={...state,status:'HOLD',reason:/^AP_[A-Z0-9_]{3,80}$/.test(e?.code||'')?e.code:'AP_REMOTE_UNCERTAIN'};
    await persist(store,state,'HOLD');return qualifyEvidence(store);
  }
}
export async function recoverOnce({store,client}){
  const s=await store.get('ap-qual-state');if(!s||!s.runId||!s.flowId)return qualifyEvidence(store);
  if(s.status==='PASS')return qualifyEvidence(store);
  const recovered=await store.get('ap-qual-recovery-attempted');
  if(recovered)return qualifyEvidence(store);
  await store.put('ap-qual-recovery-attempted',true);
  try{
    const check=assessRun(await client.call('ap_get_run',{flowRunId:s.runId}),s.flowId,s.runId,s.marker);
    const next={...s,status:check.ok?'PASS':'HOLD',phase:check.ok?'RECOVERY_READBACK_PASS':'RECOVERY_READBACK_HOLD',
      reason:check.ok?null:'AP_RECOVERY_EVIDENCE_MISMATCH',
      markerVerified:check.markerVerified,checksumVerified:check.checksumVerified};
    await persist(store,next,'RECOVERY_READBACK');
  }catch{await auditAppend(store,'RECOVERY_HOLD',{reason:'AP_RECOVERY_NETWORK_HOLD'});}
  return qualifyEvidence(store);
}
