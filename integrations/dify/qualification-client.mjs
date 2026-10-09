const ENDPOINT='https://api.dify.ai/v1/workflows/run';
const HOLD=(reason,extra={})=>Object.freeze({status:'HOLD',reason,...extra});
export function createDifyQualificationClient({env={},fetchImpl=fetch,timeoutMs=12000}={}){
  return Object.freeze({async qualify(payload){
    if(!payload||typeof payload!=='object'||!['provider','event_type','evidence_url','commit_sha','run_id'].every(k=>typeof payload[k]==='string'&&payload[k].trim()))return HOLD('INVALID_PAYLOAD');
    if(typeof env.DIFY_API_KEY!=='string'||!env.DIFY_API_KEY.trim())return HOLD('DIFY_NOT_CONFIGURED');
    const controller=new AbortController();
    let timer;
    try{
      timer=setTimeout(()=>controller.abort(),timeoutMs);
      const response=await fetchImpl(ENDPOINT,{method:'POST',headers:{Authorization:`Bearer ${env.DIFY_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({inputs:{qualification_payload:JSON.stringify(payload)},response_mode:'blocking',user:'vaos-synthetic-qualification'}),signal:controller.signal});
      if(!response.ok)return HOLD('DIFY_HTTP_ERROR',{httpStatus:response.status});
      const data=await response.json();
      if(!data||typeof data!=='object'||typeof data.workflow_run_id!=='string'||typeof data.data?.outputs?.result!=='string')return HOLD('DIFY_RESPONSE_INVALID');
      return HOLD('INDEPENDENT_VERIFICATION_REQUIRED',{difyRunId:data.workflow_run_id,modelOutput:data.data.outputs.result.slice(0,2000)});
    }catch{return HOLD('DIFY_UNAVAILABLE')}
    finally{if(timer)clearTimeout(timer)}
  }});
}
