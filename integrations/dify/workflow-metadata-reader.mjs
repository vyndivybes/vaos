/** Read-only Dify run *metadata* for founder graph inspection.
 * No workflow trigger, prompt/body logging, credentials, inputs or outputs returned.
 */
const ENDPOINT='https://api.dify.ai/v1/workflows/logs?limit=25&page=1';
function fail(code){const error=new Error(code);error.code=code;throw error}
const RUN_ID=/^[A-Za-z0-9-]{8,64}$/;
const STATUSES=new Set(['succeeded','failed','running','stopped','pending','partial-succeeded','unknown']);
export async function readDifyWorkflowMetadata({env={},fetchImpl=fetch,now=()=>new Date()}={}){
 const key=env.DIFY_API_KEY;
 if(typeof key!=='string'||!key.trim())fail('DIFY_NOT_COMMISSIONED');
 let response;
 try{
  response=await fetchImpl(ENDPOINT,{
   method:'GET',redirect:'error',headers:{Authorization:'Bearer '+key,Accept:'application/json'},
   signal:AbortSignal.timeout(8000),
  });
 }catch{fail('DIFY_SOURCE_UNAVAILABLE')}
 if(!response?.ok)fail('DIFY_SOURCE_UNAVAILABLE');
 let body;
 try{body=await response.json()}catch{fail('DIFY_FORMAT_INVALID')}
 if(!body||!Array.isArray(body.data)||body.data.length>100)fail('DIFY_FORMAT_INVALID');
 const nodes=[],seen=new Set();
 for(const entry of body.data){
  const run=entry?.workflow_run;
  const runId=run?.id;
  if(typeof runId!=='string'||!RUN_ID.test(runId)||seen.has(runId))continue;
  seen.add(runId);
  const rawStatus=typeof run.status==='string'?run.status.toLowerCase():'unknown';
  const status=STATUSES.has(rawStatus)?rawStatus:'unknown';
  nodes.push({id:'dify:'+runId,type:'workflow_run',title:'Workflow run '+status});
  if(nodes.length>=25)break;
 }
 const payload={nodes,edges:[]};
 const bytes=new TextEncoder().encode(JSON.stringify(payload));
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 const revision=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 return Object.freeze({
  schemaVersion:'VAOS_NEUTRAL_GRAPH_SOURCE_V1',sourceType:'dify',
  sourceRevision:revision,observedAt:now().toISOString(),payload,
 });
}
