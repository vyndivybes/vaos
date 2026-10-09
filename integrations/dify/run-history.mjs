// Read-only incident reconciliation. Never replays a workflow or returns model outputs.
const API='https://api.dify.ai/v1/workflows/logs';
const FROM='2026-10-09T17:07:00Z';
const TO='2026-10-09T17:15:00Z';
const hold=(reason,additional={})=>Object.freeze({status:'HOLD',reason,productionActivation:false,...additional});
export function createDifyRunHistoryClient({env={},fetchImpl=fetch,timeoutMs=12000}={}){
  return Object.freeze({async readIncident(){
    if(typeof env.DIFY_API_KEY!=='string'||!env.DIFY_API_KEY.trim())return hold('DIFY_NOT_CONFIGURED');
    const items=[];
    for(let page=1;page<=2;page++){
      const url=new URL(API);
      url.searchParams.set('created_at__after',FROM);
      url.searchParams.set('created_at__before',TO);
      url.searchParams.set('limit','100');
      url.searchParams.set('page',String(page));
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),timeoutMs);
      try{
        const response=await fetchImpl(url.toString(),{
          method:'GET',headers:{Authorization:`Bearer ${env.DIFY_API_KEY}`,Accept:'application/json'},signal:controller.signal
        });
        if(!response.ok)return hold('DIFY_LOG_HTTP_ERROR',{httpStatus:response.status});
        let data;try{data=await response.json();}catch{return hold('DIFY_LOG_NOT_JSON');}
        if(!data||!Array.isArray(data.data)||typeof data.has_more!=='boolean')
          return hold('DIFY_LOG_FORMAT_UNKNOWN');
        for(const item of data.data){
          if(!item||typeof item!=='object')continue;
          const run=item.workflow_run;
          items.push({
            logId:typeof item.id==='string'?item.id:null,
            runId:typeof run?.id==='string'?run.id:null,
            status:typeof run?.status==='string'?run.status:null,
            createdAt:Number.isFinite(item.created_at)?item.created_at:null
          });
        }
        if(!data.has_more)return Object.freeze({
          status:'HOLD',reason:items.length?'INCIDENT_RUN_CANDIDATES_FOUND':'NO_INCIDENT_RUN_OBSERVED',
          completeReadback:true,from:FROM,to:TO,runCandidates:items,
          productionActivation:false
        });
      }catch{return hold(controller.signal.aborted?'DIFY_LOG_TIMEOUT':'DIFY_LOG_UNAVAILABLE');}
      finally{clearTimeout(timer);}
    }
    return hold('DIFY_LOG_PAGINATION_INCOMPLETE',{runCandidates:items,completeReadback:false});
  }});
}
