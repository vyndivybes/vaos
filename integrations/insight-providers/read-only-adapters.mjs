// Read-only provider adapters. No index mutations, raw SQL, arbitrary URLs, or unreviewed dispatch.
// Calling code must pass a VAOS governed HTTPS transport with the configured origin allowlisted.
const CAPABILITIES=Object.freeze({metabase:'analytics.bi',qdrant:'search.semantic',meilisearch:'search.fulltext',typesense:'search.fulltext'});
function deny(code){const e=new Error('INSIGHT_'+code);e.code='INSIGHT_'+code;e.retryable=false;return e}
function text(v,max=120){return typeof v==='string'&&v.trim().length>0&&v.length<=max?v.trim():null}
function origin(url){
 let u;try{u=new URL(url)}catch{throw deny('CONFIG_INVALID')}
 if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw deny('CONFIG_INVALID');
 return u.origin;
}
const SAFE_ID=/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,119}$/;
function configFor(id,c){
 if(!c||typeof c!=='object'||!text(c.secretBindingRef,256)||!c.resources||typeof c.resources!=='object'||Array.isArray(c.resources))throw deny('CONFIG_INVALID');
 const baseUrl=origin(c.baseUrl);
 const resources=Object.create(null);
 for(const [key,r] of Object.entries(c.resources)){
  if(!SAFE_ID.test(key)||!r||!SAFE_ID.test(r.tenantId||''))throw deny('CONFIG_INVALID');
  if(typeof r.remoteId!=='string'&&typeof r.remoteId!=='number')throw deny('CONFIG_INVALID');
  const remoteId=String(r.remoteId);
  if(!SAFE_ID.test(remoteId))throw deny('CONFIG_INVALID');
  const vectorDimensions=r.vectorDimensions;
  if(id==='qdrant'&&(!Number.isInteger(vectorDimensions)||vectorDimensions<1||vectorDimensions>2048))throw deny('CONFIG_INVALID');
  if(id==='metabase'&&(!/^\d+$/.test(remoteId)||r.dedicatedTenant!==true))throw deny('TENANT_ISOLATION_REQUIRED');
  const fields=r.fields===undefined?['tenant_id'] : r.fields;
  if(!Array.isArray(fields)||fields.length===0||fields.length>20||fields.some(f=>!SAFE_ID.test(f))||!fields.includes('tenant_id'))throw deny('CONFIG_INVALID');
  resources[key]=Object.freeze({tenantId:r.tenantId,remoteId,fields:Object.freeze([...fields]),...(id==='qdrant'?{vectorDimensions}:{})});
 }
 if(Object.keys(resources).length===0)throw deny('CONFIG_INVALID');
 return Object.freeze({baseUrl,secretBindingRef:c.secretBindingRef,resources:Object.freeze(resources)});
}
function validJob(job,cfg,id){
 const jobId=text(job?.id),intentId=text(job?.intentId),tenantId=text(job?.tenantId);
 const resourceKey=text(job?.payload?.resourceKey);
 if(!jobId||!intentId||!tenantId||!resourceKey||!SAFE_ID.test(tenantId)||!SAFE_ID.test(resourceKey)||job?.actionType!=='READ.INSIGHT')throw deny('JOB_INVALID');
 const resource=cfg.resources[resourceKey];
 if(!resource)throw deny('RESOURCE_DENIED');
 if(resource.tenantId!==tenantId)throw deny('TENANT_DENIED');
 let query=null;
 if(id==='qdrant'){
  const v=job?.payload?.vector;
  if(!Array.isArray(v)||v.length!==resource.vectorDimensions||!v.every(x=>typeof x==='number'&&Number.isFinite(x)))throw deny('QUERY_INVALID');
  query=[...v];
 } else if(id!=='metabase'){
  query=text(job?.payload?.query,256);
  if(!query)throw deny('QUERY_INVALID');
 }
 return Object.freeze({jobId,intentId,tenantId,resourceKey,resource,query});
}
function makeRequest(id,cfg,j,credential){
 const idPath=encodeURIComponent(j.resource.remoteId);
 const head={Accept:'application/json'};
 if(!credential||!text(credential.value,4096))throw deny('CREDENTIAL_INVALID');
 if(id==='meilisearch'){
  if(credential.kind!=='bearer')throw deny('CREDENTIAL_INVALID');
  head.Authorization='Bearer '+credential.value;
  return{url:cfg.baseUrl+'/indexes/'+idPath+'/search',method:'POST',headers:head,body:{q:j.query,limit:20,filter:'tenant_id = "'+j.tenantId+'"'}};
 }
 if(credential.kind!=='api-key')throw deny('CREDENTIAL_INVALID');
 if(id==='metabase'){
  head['X-API-Key']=credential.value;
  // Saved question execution uses the documented POST query endpoint; no arbitrary SQL is accepted.
  return{url:cfg.baseUrl+'/api/card/'+idPath+'/query',method:'POST',headers:head,body:{parameters:[]}};
 }
 if(id==='qdrant'){
  head['api-key']=credential.value;
  return{url:cfg.baseUrl+'/collections/'+idPath+'/points/query',method:'POST',headers:head,body:{query:j.query,limit:20,with_payload:j.resource.fields,with_vector:false,filter:{must:[{key:'tenant_id',match:{value:j.tenantId}}]}}};
 }
 head['X-TYPESENSE-API-KEY']=credential.value;
 const params=new URLSearchParams({q:j.query,query_by:j.resource.fields.filter(f=>f!=='tenant_id').join(','),filter_by:'tenant_id:='+j.tenantId,per_page:'20'});
 if(!params.get('query_by'))throw deny('CONFIG_INVALID');
 return{url:cfg.baseUrl+'/collections/'+idPath+'/documents/search?'+params.toString(),method:'GET',headers:head};
}
function rowsFor(id,body){
 if(id==='metabase'){
  const cols=body?.data?.cols;
  const sourceRows=body?.data?.rows;
  if(!Array.isArray(cols)||!Array.isArray(sourceRows)||cols.length<1||cols.length>200)throw deny('RESPONSE_INVALID');
  const names=cols.map(c=>c?.name);
  if(names.some(n=>typeof n!=='string'||!SAFE_ID.test(n))||new Set(names).size!==names.length)throw deny('RESPONSE_INVALID');
  return sourceRows.slice(0,21).map(row=>{
   if(!Array.isArray(row)||row.length!==names.length)throw deny('RESPONSE_INVALID');
   return Object.fromEntries(names.map((name,i)=>[name,row[i]]));
  });
 }
 if(id==='qdrant')return body?.result?.points?.map(p=>p?.payload);
 if(id==='meilisearch')return body?.hits;
 return body?.hits?.map(h=>h?.document);
}
function readRows(id,r,j){
 const rows=rowsFor(id,r?.body);
 if(!Array.isArray(rows))throw deny('RESPONSE_INVALID');
 const out=[];
 if(rows.length>20)throw deny('RESPONSE_TOO_LARGE');
 for(const entry of rows){
  if(!entry||typeof entry!=='object'||Array.isArray(entry)||entry.tenant_id!==j.tenantId)throw deny('TENANT_READBACK_MISMATCH');
  const row=Object.create(null);
  for(const name of j.resource.fields){
   const value=entry[name];
   if(value===undefined||value===null)continue;
   if(!['string','number','boolean'].includes(typeof value)||typeof value==='string'&&value.length>1024||typeof value==='number'&&!Number.isFinite(value))throw deny('RESPONSE_INVALID');
   row[name]=value;
  }
  out.push(Object.freeze(row));
 }
 return Object.freeze(out);
}
export function createInsightReadAdapter({providerId,capabilityRegistry,credentialBroker,transport,config}={}){
 const capability=CAPABILITIES[providerId];
 if(!capability)throw deny('PROVIDER_INVALID');
 if((typeof capabilityRegistry?.get!=='function'&&typeof capabilityRegistry?.resolve!=='function')||typeof credentialBroker?.withCredential!=='function'||typeof transport?.request!=='function')throw deny('DEPENDENCY_REQUIRED');
 const cfg=configFor(providerId,config);
 return Object.freeze({
  id:providerId+'.insight-read.v1',providerId,capability,
  async execute(job){
   // Enforce provider authorization before parsing provider-specific query input.
   // Standalone callers use the explicit provider manifest; governed ProviderRuntime
   // passes its selected-provider gate after control-plane qualification and health checks.
   let admitted=false;
   if(typeof capabilityRegistry.get==='function'){
    const manifest=capabilityRegistry.get(providerId);
    admitted=manifest?.enabled===true&&manifest.qualification?.state==='qualified'&&manifest.qualification.qualifiedCapabilities?.includes(capability)===true;
   }else{
    const selected=capabilityRegistry.resolve(capability,{allowedProviderIds:[providerId]});
    admitted=selected?.providerId===providerId;
   }
   if(!admitted)throw deny('PROVIDER_NOT_QUALIFIED');
   const j=validJob(job,cfg,providerId);
   const response=await credentialBroker.withCredential({bindingRef:cfg.secretBindingRef,providerId,capability,executionJobId:j.jobId,intentId:j.intentId},async credential=>{
    const req=makeRequest(providerId,cfg,j,credential);
    // Safe when injected transport is createGovernedHttpTransport({allowedOrigins:[cfg.baseUrl]})
    if(new URL(req.url).origin!==cfg.baseUrl)throw deny('ORIGIN_DENIED');
    return transport.request({...req,timeoutMs:15000,allowedResponseTypes:['application/json']});
   });
   if(!Number.isInteger(response?.status)||response.status<200||response.status>=300)throw deny('PROVIDER_HTTP_ERROR');
   const records=readRows(providerId,response,j);
   return Object.freeze({status:'OBSERVED',providerId,capability,tenantId:j.tenantId,resourceKey:j.resourceKey,sourceAuthority:providerId+'.api.read',canonicalStateUpdated:false,records,
    effect:Object.freeze({effectType:'INSIGHT.READ_OBSERVED',resourceType:'EXTERNAL_INSIGHT_READ',resourceId:providerId+':'+j.resource.remoteId,canonicalStateUpdated:false}),
    verification:Object.freeze({verified:true,verificationScope:'response-schema-and-tenant-only',sourceRead:true,independentlyVerified:false,sourceRef:providerId+':'+j.resource.remoteId,executionJobId:j.jobId,intentId:j.intentId})});
  }
 });
}
