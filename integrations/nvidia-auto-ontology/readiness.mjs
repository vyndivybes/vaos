// NVIDIA Auto Ontology gateway preflight. This client does NOT ingest VYNDI rows,
// call text-to-SQL, import a model, or grant an action. No secrets enter results.
// Official gateway: Next.js HTTPS app, never internal FastAPI port 3001.
const SCHEMA='VAOS_NVIDIA_ONTOLOGY_READINESS_V1';
const JSON_LIMIT=24_576;
const ROUTES=Object.freeze([
 '/api/semantic-compilation/status',
 '/api/connections',
 '/api/datasources/dbs',
]);
const BASE=Object.freeze({
 schemaVersion:SCHEMA,status:'HOLD',reason:'ONTOLOGY_NOT_CONFIGURED',
 readOnly:true,semanticLayerBuilt:false,connectionPresent:false,catalogPresent:false,
 sourceDataTransferred:false,modelAnswersVerified:false,productionWriteAuthorized:false,
});
const record=(reason,patch={})=>({...BASE,...patch,status:'HOLD',reason});
export const holdNvidiaOntology=reason=>record(reason);
const isSafeCount=value=>Number.isSafeInteger(value)&&value>0;

export function validateOntologyOrigin(raw){
 if(typeof raw!=='string'||raw.length>2048||raw!==raw.trim()||
    /[?#%\\]/.test(raw))return null;
 try{
  const url=new URL(raw);
  const host=url.hostname.toLowerCase();
  if(url.protocol!=='https:'||url.username||url.password||url.port||
     (url.pathname!==''&&url.pathname!=='/')||
     !host.includes('.')||host.includes(':')||!/^([a-z0-9-]+\.)+[a-z0-9-]+$/.test(host)||
     /(^|\.)(localhost|local|internal|invalid|test|onion)$/.test(host)||
     /^\d+(\.\d+){3}$/.test(host))return null;
  return url.origin;
 }catch{return null;}
}

async function readProbe(fetchImpl,origin,token,path,timeoutMs){
 let response;
 try{
  response=await fetchImpl(origin+path,{
   method:'GET',redirect:'error',cache:'no-store',
   headers:{accept:'application/json','x-api-key':token},
   signal:AbortSignal.timeout(timeoutMs),
  });
 }catch{return {error:'ONTOLOGY_TRANSPORT_HOLD'};}
 if(response?.status===401)return {error:'ONTOLOGY_AUTH_REJECTED'};
 if(response?.status===403)return {error:'ONTOLOGY_PERMISSION_UNVERIFIED'};
 if(response?.status!==200)return {error:'ONTOLOGY_UPSTREAM_HOLD'};
 const type=response.headers?.get?.('content-type')||'';
 if(!/^application\/json(?:;|$)/i.test(type))return {error:'ONTOLOGY_RESPONSE_UNQUALIFIED'};
 const size=Number(response.headers?.get?.('content-length'));
 if(Number.isFinite(size)&&size>JSON_LIMIT)return {error:'ONTOLOGY_RESPONSE_UNQUALIFIED'};
 try{
  const body=await response.text();
  if(body.length>JSON_LIMIT)return {error:'ONTOLOGY_RESPONSE_UNQUALIFIED'};
  const parsed=JSON.parse(body);
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return {error:'ONTOLOGY_RESPONSE_UNQUALIFIED'};
  return {value:parsed};
 }catch{return {error:'ONTOLOGY_RESPONSE_UNQUALIFIED'};}
}

export async function inspectNvidiaAutoOntology(env={},{
 fetchImpl=globalThis.fetch,timeoutMs=4500,
}={}){
 const raw=env?.NVIDIA_AUTO_ONTOLOGY_URL;
 if(typeof raw!=='string'||!raw.trim())return record('ONTOLOGY_ENDPOINT_NOT_CONFIGURED');
 const origin=validateOntologyOrigin(raw);
 if(!origin)return record('ONTOLOGY_ENDPOINT_UNSAFE');
 const token=env?.NVIDIA_AUTO_ONTOLOGY_API_TOKEN;
 if(typeof token!=='string'||!token.trim()||token.length>4096)
  return record('ONTOLOGY_TOKEN_NOT_CONFIGURED');
 if(typeof fetchImpl!=='function')return record('ONTOLOGY_TRANSPORT_HOLD');
 const timeout=Number.isSafeInteger(timeoutMs)?Math.min(Math.max(timeoutMs,500),5000):4500;
 const flags={};
 const status=await readProbe(fetchImpl,origin,token,ROUTES[0],timeout);
 if(status.error)return record(status.error,flags);
 if(status.value?.calculated!==true)return record('SEMANTIC_LAYER_NOT_READY',flags);
 flags.semanticLayerBuilt=true;
 const connection=await readProbe(fetchImpl,origin,token,ROUTES[1],timeout);
 if(connection.error)return record(connection.error,flags);
 if(!isSafeCount(connection.value?.count))return record('CONNECTION_NOT_READY',flags);
 flags.connectionPresent=true;
 const catalog=await readProbe(fetchImpl,origin,token,ROUTES[2],timeout);
 if(catalog.error)return record(catalog.error,flags);
 if(!Array.isArray(catalog.value?.data)||
   !catalog.value.data.some(x=>x&&typeof x.name==='string'&&x.name.trim()))
  return record('CATALOG_NOT_READY',flags);
 flags.catalogPresent=true;
 return {...BASE,...flags,status:'READY',reason:'READINESS_OBSERVED'};
}
