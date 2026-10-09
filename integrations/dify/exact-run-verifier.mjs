// Historical, immutable Dify verification only: no workflow POST, no secret or model output exposure.
const RUN_ID='051bdeb7-b9f7-4354-bfbd-1dbc0e22b385';
const EXPECTED={provider:'activepieces',event_type:'synthetic_qualification',
  evidence_url:'https://github.com/vyndivybes/vaos/actions/runs/37928775640',
  commit_sha:'7ca10821419f7fd315f8bae4f1591e7605dd282b',run_id:'37928775640'};
const START_EPOCH=1791565688;
const END_EPOCH=1791565705;
const hold=(reason,extra={})=>Object.freeze({status:'HOLD',reason,productionActivation:false,...extra});
const parseJson=v=>{if(typeof v==='object'&&v!==null&&!Array.isArray(v))return v;
  if(typeof v==='string')try{const x=JSON.parse(v);return x&&typeof x==='object'&&!Array.isArray(x)?x:null}catch{}
  return null;};
export function createDifyExactRunVerifier({env={},fetchImpl=fetch,timeoutMs=15000}={}){
  return Object.freeze({async verifyExistingRun(){
    if(typeof env.DIFY_API_KEY!=='string'||!env.DIFY_API_KEY.trim())return hold('DIFY_NOT_CONFIGURED');
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const response=await fetchImpl('https://api.dify.ai/v1/workflows/run/'+RUN_ID,{
        method:'GET',headers:{Authorization:`Bearer ${env.DIFY_API_KEY}`,Accept:'application/json'},signal:controller.signal
      });
      if(!response.ok)return hold('DIFY_DETAIL_HTTP_ERROR',{httpStatus:response.status});
      let data;try{data=await response.json();}catch{return hold('DIFY_DETAIL_NOT_JSON');}
      if(!data||typeof data!=='object'||data.id!==RUN_ID)return hold('DIFY_RUN_ID_MISMATCH');
      if(data.status!=='succeeded')return hold('DIFY_RUN_NOT_SUCCESS',{runId:RUN_ID});
      const inputs=parseJson(data.inputs);
      const actual=parseJson(inputs?.qualification_payload);
      if(!actual||Object.keys(EXPECTED).some(k=>actual[k]!==EXPECTED[k])||
        Object.keys(actual).length!==Object.keys(EXPECTED).length)
        return hold('DIFY_INPUT_IDENTITY_MISMATCH',{runId:RUN_ID});
      const createdAt=data.created_at;
      if(!Number.isInteger(createdAt)||createdAt<START_EPOCH||createdAt>END_EPOCH)
        return hold('DIFY_RUN_TIMESTAMP_UNVERIFIED',{runId:RUN_ID,identityVerified:true});
      const output=data.outputs?.result;
      if(typeof output!=='string'||!output.trim())
        return hold('DIFY_OUTPUT_MISSING',{runId:RUN_ID,identityVerified:true});
      // Model-produced PASS is never taken as its own qualification authority.
      // GitHub CI run and its job must be independently read back by qualification operator.
      return Object.freeze({status:'PASS',reason:'DIFY_EXACT_RUN_VERIFIED',
        runId:RUN_ID,createdAt,identityVerified:true,outputPresent:true,
        githubEvidenceRunId:EXPECTED.run_id,githubEvidenceCommitSha:EXPECTED.commit_sha,
        productionActivation:false});
    }catch{return hold(controller.signal.aborted?'DIFY_DETAIL_TIMEOUT':'DIFY_DETAIL_UNAVAILABLE');}
    finally{clearTimeout(timer);}
  }});
}
