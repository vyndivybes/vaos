/** Founder-only historical knowledge index gateway.
 * All indexed bodies use AES-GCM with the already provisioned private VAOS
 * vault CryptoKey and the private R2 bucket. No bearer-token or source body is
 * returned from a sync operation or logged.
 */
import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {featureControl} from '../lib/feature-flags.mjs';
import {apiError} from '../lib/api-contracts.mjs';
import {createHistoricalStore} from '../../../platform/knowledge/history-index.mjs';
import {founderHistoricalCredential} from './google-workspace.mjs';
import {readGoogleHistoryPage} from '../../../integrations/google/history-source.mjs';

const FOUNDER='shyamsundhar1982@gmail.com';
const IMPORTABLE=new Set(['chatgpt','obsidian','graphiti','graphify','github','vyndios','vaos']);
const GOOGLE=new Set(['gmail','drive']);
const PATH='/api/history-index';
const respond=(res,status,data)=>res.status(status).json(data);
const error=(res,status,code,description)=>respond(res,status,apiError(code,description));
function safeOrigin(req){
 try{return req.headers?.origin===new URL(req.url).origin;}catch{return false;}
}
function paramsOf(req,path){
 const url=new URL(req.url,'https://vaos.local');
 if(url.pathname!==path)throw Error('PATH_INVALID');
 const p=url.searchParams;
 if([...p.keys()].some(k=>p.getAll(k).length!==1))throw Error('QUERY_DENIED');
 return p;
}
function isJSON(req){
 return /^application\/json(?:\s*;|$)/i.test(req.headers?.['content-type']||'');
}
function validBody(body){
 if(!body||typeof body!=='object'||Array.isArray(body))return false;
 try{return JSON.stringify(body).length<=680000;}catch{return false;}
}
export function createHistoryIndexHandler({
 makeStore=createHistoricalStore,googleToken=founderHistoricalCredential,
 googlePage=readGoogleHistoryPage,fetchImpl=globalThis.fetch
}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  const session=verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]);
  if(!session)return error(res,401,'UNAUTHENTICATED','Founder sign-in required');
  if(session.email!==FOUNDER)return error(res,403,'FOUNDER_ONLY','Founder-only historical knowledge');
  const env=req.env||{};
  if(featureControl(env,'VAOS_HISTORY_INDEX_CONTROL')!=='founder-index-v1')
   return error(res,409,'HISTORY_INDEX_DISABLED','Private historical indexing not commissioned');
  let path,params;
  try{
   path=new URL(req.url,'https://vaos.local').pathname;
   if(![PATH+'/status',PATH+'/search',PATH+'/read',PATH+'/ingest',PATH+'/sync',PATH+'/purge'].includes(path))
    return error(res,404,'NOT_FOUND','Unknown history operation');
   params=paramsOf(req,path);
  }catch{return error(res,422,'HISTORY_QUERY_DENIED','Invalid history request');}
  const write=['POST','DELETE'].includes(req.method);
  if(write&&!safeOrigin(req))return error(res,403,'ORIGIN_DENIED','Same-origin founder request required');
  if(req.method==='POST'&&!isJSON(req))return error(res,415,'JSON_REQUIRED','JSON request required');
  if(req.method==='POST'&&!validBody(req.body))return error(res,413,'BODY_TOO_LARGE','Bounded request required');
  if(req.method==='GET'&&!['/status','/search','/read'].some(s=>path===PATH+s))
   return error(res,405,'METHOD_NOT_ALLOWED','POST or DELETE required');
  if(req.method==='POST'&&!['/sync','/ingest'].some(s=>path===PATH+s))
   return error(res,405,'METHOD_NOT_ALLOWED','Read or DELETE required');
  if(req.method==='DELETE'&&path!==PATH+'/purge')
   return error(res,405,'METHOD_NOT_ALLOWED','Unsupported operation');
  if(!['GET','POST','DELETE'].includes(req.method))
   return error(res,405,'METHOD_NOT_ALLOWED','Method denied');
  const store=makeStore(env);
  try{
   if(path===PATH+'/status'){
    if(params.size)return error(res,422,'HISTORY_QUERY_DENIED','No parameters accepted');
    const data=await store.status();
    return respond(res,200,{data});
   }
   if(path===PATH+'/search'){
    if([...params.keys()].some(x=>!['q','sources','cursor','limit'].includes(x)))
     return error(res,422,'HISTORY_QUERY_DENIED','Invalid search options');
    const sources=params.get('sources')?.split(',')||undefined;
    const cursor=params.has('cursor')?Number(params.get('cursor')):0;
    const limit=params.has('limit')?Number(params.get('limit')):12;
    const data=await store.search({query:params.get('q'),sources,cursor,limit});
    return respond(res,200,{data});
   }
   if(path===PATH+'/read'){
    if(params.size!==2||!params.has('source')||!params.has('id'))
     return error(res,422,'HISTORY_QUERY_DENIED','Source and record ID required');
    const data=await store.read(params.get('source'),params.get('id'));
    return data?respond(res,200,{data}):error(res,404,'HISTORY_RECORD_NOT_FOUND','Record not indexed');
   }
   if(path===PATH+'/ingest'){
    if(params.size||!IMPORTABLE.has(req.body.source)||!Array.isArray(req.body.records))
     return error(res,422,'HISTORY_IMPORT_DENIED','Only explicitly selected source exports accepted');
    const data=await store.ingest(req.body.source,req.body.records);
    return respond(res,200,{...data,actionAuthorized:false});
   }
   if(path===PATH+'/sync'){
    const source=req.body.source;
    if(params.size||!GOOGLE.has(source)||Object.keys(req.body).some(x=>!['source','restart'].includes(x))||
      (req.body.restart!==undefined&&req.body.restart!==true))
     return error(res,422,'HISTORY_SYNC_DENIED','Only scoped Google read synchronization accepted');
    const progress=await store.progress(source);
    if(progress.complete&&!req.body.restart)
     return respond(res,200,{status:'ENUMERATION_COMPLETE',source,
      indexedThisStep:0,enumerationComplete:true,actionAuthorized:false});
    // No OAuth token is sent to the client or persisted in corpus storage.
    const token=await googleToken(env,source,{fetchImpl});
    const page=await googlePage({source,token,
     cursor:req.body.restart?null:progress.cursor,fetchImpl});
    if(page?.source!==source||!Array.isArray(page.records)||page.records.length>12||
      typeof page.complete!=='boolean')throw Error('HISTORY_PROVIDER_INVALID');
    const ingested=page.records.length?await store.ingest(source,page.records):
     {added:0,updated:0,unchanged:0};
    await store.checkpoint(source,page.nextCursor||null,page.complete);
    return respond(res,200,{status:'OBSERVED',source,indexedThisStep:page.records.length,
     added:ingested.added,updated:ingested.updated,unchanged:ingested.unchanged,
     enumerationComplete:page.complete,hasMore:!page.complete,
     actionAuthorized:false});
   }
   if(path===PATH+'/purge'){
    if(params.size!==1||!params.has('source')||!IMPORTABLE.has(params.get('source'))&&
      !GOOGLE.has(params.get('source')))
     return error(res,422,'HISTORY_PURGE_DENIED','Indexed source required');
    const data=await store.purge(params.get('source'),{limit:20});
    return respond(res,200,{...data,status:'OBSERVED',actionAuthorized:false});
   }
  }catch(_e){
   // No remote exception, document content, account identity or bearer token
   // may enter error bodies or logs.
   return error(res,503,'HISTORY_SOURCE_HOLD',
    'Encrypted index or explicitly authorized source is unavailable');
  }
 };
}
export default createHistoryIndexHandler();
