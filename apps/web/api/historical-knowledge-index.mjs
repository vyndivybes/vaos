/** VAOS controlled historical Google index.
 * Incremental read-only Google retrieval, private encrypted R2 records.
 * Never sends source bodies to the browser, logs, GitHub or Graphify.
 * This is a bounded text index, NOT full binary/attachment coverage.
 */
import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {apiError} from '../lib/api-contracts.mjs';
import {featureControl} from '../lib/feature-flags.mjs';
import {founderGoogleCredential} from './google-workspace.mjs';

const FOUNDER='shyamsundhar1982@gmail.com';
const MAX_INDEXED_PER_SOURCE=12000;
const PREFIX='runtime/history-index/v1/';
const AAD=new TextEncoder().encode('vaos:history-index:private:v1');
const enc=new TextEncoder(),dec=new TextDecoder();
const MAIL_SCOPE='https://www.googleapis.com/auth/gmail.readonly';
const DRIVE_SCOPE='https://www.googleapis.com/auth/drive.readonly';
const GMAIL='https://gmail.googleapis.com/gmail/v1/users/me/messages';
const DRIVE='https://www.googleapis.com/drive/v3/files';
const allow=(key)=>key?.type==='secret'&&key.extractable===false&&key.algorithm?.name==='AES-GCM'&&
 key.algorithm.length===256&&key.usages?.includes('encrypt')&&key.usages?.includes('decrypt');
const b64=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
const un64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
const hex=bytes=>Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('');
const digest=async s=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(s))));
const fail=code=>{throw Error(code)};
export async function sealRecord(record,key){
 if(!allow(key)||!['gmail','drive'].includes(record?.source))fail('HISTORY_KEY_OR_SOURCE_INVALID');
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const bytes=enc.encode(JSON.stringify(record));
 if(bytes.length>24000)fail('HISTORY_RECORD_TOO_LARGE');
 const result=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:AAD},key,bytes);
 return {v:1,source:record.source,iv:b64(iv),data:b64(new Uint8Array(result))};
}
export async function openRecord(document,key){
 if(!allow(key)||document?.v!==1||!['gmail','drive'].includes(document?.source)||
 typeof document?.data!=='string'||document.data.length>40000||
 typeof document?.iv!=='string'||document.iv.length>40)fail('HISTORY_ENVELOPE_INVALID');
 const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:un64(document.iv),additionalData:AAD},
  key,un64(document.data));
 const value=JSON.parse(dec.decode(bytes));
 if(value?.source!==document.source)fail('HISTORY_SOURCE_MISMATCH');
 return value;
}
export function validateSyncRequest(value){
 if(!value||Array.isArray(value)||typeof value!=='object'||
  Object.keys(value).length!==1||!['gmail','drive'].includes(value.source))fail('HISTORY_REQUEST_DENIED');
 return {source:value.source};
}
export function advanceCheckpoint(prev,{source,count,next,skipped=0}){
 if(!['gmail','drive'].includes(source)||!Number.isInteger(count)||count<0||count>20||
 !Number.isInteger(skipped)||skipped<0||skipped>20||count+skipped>20||
 (next!==null&&(typeof next!=='string'||next.length>512)))fail('HISTORY_BATCH_INVALID');
 if(prev&&prev.source!==source)fail('HISTORY_SOURCE_MISMATCH');
 return {source,page:(prev?.page||0)+1,indexed:(prev?.indexed||0)+count,
  skipped:(prev?.skipped||0)+skipped,next,
  state:next===null?'LISTING_COMPLETE':'PARTIAL',
  contentComplete:false, // binary documents, attachments and embedded files are not extracted
  sourceCoverageCertified:false,actionAuthorized:false,
  updatedAt:new Date().toISOString()};
}
function readOnlyHeaders(res){
 res.setHeader('Cache-Control','private, no-store');res.setHeader('Pragma','no-cache');
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
}
async function getJSON(url,token,fetchImpl){
 const response=await fetchImpl(url,{method:'GET',headers:{Authorization:'Bearer '+token},
  redirect:'manual',signal:AbortSignal.timeout(9000)});
 if(response.status!==200)fail('HISTORY_PROVIDER_UNAVAILABLE');
 return response.json();
}
function sanitize(v,n=180){
 return typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,n):'';
}
function plainText(item){
 const sections=[];
 function visit(part,depth=0){
  if(!part||depth>4)return;
  if(part.mimeType==='text/plain'&&typeof part.body?.data==='string'&&part.body.data.length<32000){
   try{sections.push(dec.decode(un64(part.body.data)))}catch{}
  }
  for(const child of (Array.isArray(part.parts)?part.parts:[]).slice(0,30))visit(child,depth+1);
 }
 visit(item?.payload);
 return sections.join('\n').slice(0,10000);
}
async function gmailBatch(token,cursor,fetchImpl){
 const q=new URLSearchParams({maxResults:'12',includeSpamTrash:'false'});
 if(cursor)q.set('pageToken',cursor);
 const listing=await getJSON(GMAIL+'?'+q,token,fetchImpl);
 if(!Array.isArray(listing.messages)&&listing.resultSizeEstimate!==0)fail('HISTORY_GMAIL_LIST_INVALID');
 const items=[],skipped=[];
 for(const row of (listing.messages||[]).slice(0,12)){
  if(!/^[A-Za-z0-9_-]{5,100}$/.test(row?.id||'')){skipped.push('INVALID_ID');continue;}
  try{
   const message=await getJSON(GMAIL+'/'+encodeURIComponent(row.id)+'?format=full',token,fetchImpl);
   if(message?.id!==row.id||!Array.isArray(message.payload?.headers))throw Error();
   const header=n=>sanitize(message.payload.headers.find(h=>String(h.name).toLowerCase()===n)?.value||'',220);
   items.push({source:'gmail',id:row.id,threadId:sanitize(message.threadId,100),
    kind:'message',subject:header('subject'),from:header('from'),to:header('to'),
    date:header('date'),timestamp:sanitize(message.internalDate,32),
    snippet:sanitize(message.snippet,500),text:plainText(message),
    extracted:'text/plain only; attachments excluded',
    observedAt:new Date().toISOString()});
  }catch{skipped.push('MESSAGE_READ_HOLD');}
 }
 return {items,next:listing.nextPageToken||null,skipped};
}
const fileTextTypes=new Set(['text/plain','text/markdown','text/csv','application/json']);
const GOOGLE_DOC='application/vnd.google-apps.document';
async function driveBatch(token,cursor,fetchImpl){
 const q=new URLSearchParams({q:'trashed = false',pageSize:'12',
  fields:'nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink,description)',
  orderBy:'modifiedTime desc'});
 if(cursor)q.set('pageToken',cursor);
 const listing=await getJSON(DRIVE+'?'+q,token,fetchImpl);
 if(!Array.isArray(listing.files))fail('HISTORY_DRIVE_LIST_INVALID');
 const items=[],skipped=[];
 for(const row of listing.files.slice(0,12)){
  if(typeof row?.id!=='string'||! /^[A-Za-z0-9_-]{5,200}$/.test(row.id||'')){
   skipped.push('INVALID_ID');continue;
  }
  let content='',reason='metadata-only unsupported mime type';
  try{
   let response=null;
   if(row.mimeType===GOOGLE_DOC)
    response=await fetchImpl(DRIVE+'/'+encodeURIComponent(row.id)+'/export?mimeType=text%2Fplain',
     {method:'GET',headers:{Authorization:'Bearer '+token},redirect:'manual',signal:AbortSignal.timeout(9000)});
   else if(fileTextTypes.has(row.mimeType))
    response=await fetchImpl(DRIVE+'/'+encodeURIComponent(row.id)+'?alt=media',
     {method:'GET',headers:{Authorization:'Bearer '+token},redirect:'manual',signal:AbortSignal.timeout(9000)});
   if(response?.status===200){
    const raw=await response.text();
    content=raw.slice(0,10000);
    reason=raw.length>10000?'partial text preview':'text indexed';
   }else if(response)reason='content unavailable';
  }catch{reason='content unavailable';}
  items.push({source:'drive',id:row.id,kind:'file',
   title:sanitize(row.name),mimeType:sanitize(row.mimeType,100),
   modifiedAt:sanitize(row.modifiedTime,40),description:sanitize(row.description,500),
   text:content,extractionStatus:reason,observedAt:new Date().toISOString()});
 }
 return {items,next:listing.nextPageToken||null,skipped};
}
const checkpointKey=source=>PREFIX+'checkpoint/'+source+'.json';
async function readCheckpoint(bucket,key,source){
 const obj=await bucket.get(checkpointKey(source));
 if(!obj)return {cursor:null,prior:null,etag:null};
 const envelope=JSON.parse(await obj.text());
 const record=await openRecord(envelope,key);
 if(record.source!==source||record.kind!=='checkpoint'||typeof record.data!=='object')fail('HISTORY_CHECKPOINT_INVALID');
 return {cursor:record.data.next,prior:record.data,etag:obj.httpEtag||null};
}
async function storeCheckpoint(bucket,key,source,prev,etag){
 const data=await sealRecord({source,kind:'checkpoint',data:prev},key);
 const options={httpMetadata:{contentType:'application/json'}};
 if(etag)options.onlyIf=new Headers({'If-Match':etag});
 else options.onlyIf=new Headers({'If-None-Match':'*'});
 const result=await bucket.put(checkpointKey(source),JSON.stringify(data),options);
 if(!result)fail('HISTORY_SYNC_CONFLICT');
}
export function createHistoricalIndexHandler({fetchImpl=globalThis.fetch,tokenReader=founderGoogleCredential}={}){
 return async(req,res)=>{
  readOnlyHeaders(res);
  if(!['GET','POST'].includes(req.method)){
   res.setHeader('Allow','GET, POST');return res.status(405).json(apiError('METHOD_NOT_ALLOWED','GET or POST only'));
  }
  const session=verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]);
  if(!session)return res.status(401).json(apiError('UNAUTHENTICATED','Founder session required'));
  if(session.email!==FOUNDER)return res.status(403).json(apiError('FOUNDER_ONLY','Founder authorization required'));
  const env=req.env||{};
  if(featureControl(env,'VAOS_HISTORICAL_INDEX_CONTROL')!=='founder-manual-encrypted-v1')
   return res.status(409).json(apiError('HISTORY_INDEX_DISABLED','Manual archive indexing is not commissioned'));
  if(!allow(env.VAOS_GOOGLE_VAULT_KEY)||typeof env.VAOS_ARTIFACTS?.get!=='function'||
   typeof env.VAOS_ARTIFACTS?.put!=='function')
   return res.status(503).json(apiError('HISTORY_PRIVATE_STORAGE_HOLD','Encrypted R2 store not qualified'));
  let params;
  try{params=new URL(req.url,'https://vaos.local').searchParams;
   if(params.size||new URL(req.url,'https://vaos.local').pathname!=='/api/historical-knowledge-index')throw Error();
  }catch{return res.status(422).json(apiError('HISTORY_QUERY_DENIED','No URL parameters allowed'));}
  if(req.method==='POST'){
   const requestOrigin=new URL(req.url,'https://vaos.local').origin;
   if(req.headers?.origin!==requestOrigin||
     (req.headers?.['sec-fetch-site']&&!['same-origin','none'].includes(req.headers['sec-fetch-site'])))
    return res.status(403).json(apiError('HISTORY_ORIGIN_DENIED','Same-origin founder action required'));
  }
  let source;
  try{source=req.method==='POST'?validateSyncRequest(req.body).source:
    ['gmail','drive'].includes(''+req.headers?.['x-history-source'])?req.headers['x-history-source']:null;
   if(!source)throw Error();}catch{return res.status(422).json(apiError('HISTORY_SOURCE_DENIED','Select Gmail or Drive'));}
  try{
   const bucket=env.VAOS_ARTIFACTS,key=env.VAOS_GOOGLE_VAULT_KEY;
   const state=await readCheckpoint(bucket,key,source);
   if(req.method==='GET')return res.status(200).json({data:{status:state.prior?.state||'NOT_STARTED',
    source,processed:state.prior?.indexed||0,skipped:state.prior?.skipped||0,
    pages:state.prior?.page||0,contentComplete:false,sourceCoverageCertified:false,actionAuthorized:false}});
   if(state.prior?.state==='LISTING_COMPLETE')
    return res.status(200).json({data:{source,status:'LISTING_COMPLETE',
      processed:state.prior.indexed,skipped:state.prior.skipped,actionAuthorized:false,
      contentComplete:false,sourceCoverageCertified:false}});
   if((state.prior?.indexed||0)+12>MAX_INDEXED_PER_SOURCE)
    return res.status(409).json(apiError('HISTORY_FREE_TIER_CAP','Per-source free-tier safety cap reached'));
   const token=await tokenReader(env,{fetchImpl,
    required:[source==='gmail'?MAIL_SCOPE:DRIVE_SCOPE]});
   const batch=source==='gmail'?await gmailBatch(token,state.cursor,fetchImpl):
    await driveBatch(token,state.cursor,fetchImpl);
   for(const item of batch.items){
    const id=await digest(source+':'+item.id);
    const envelope=await sealRecord(item,key);
    await bucket.put(PREFIX+'records/'+source+'/'+id+'.json',JSON.stringify(envelope),
     {httpMetadata:{contentType:'application/json'}});
   }
   const checkpoint=advanceCheckpoint(state.prior,{source,count:batch.items.length,
    next:batch.next,skipped:batch.skipped.length});
   await storeCheckpoint(bucket,key,source,checkpoint,state.etag);
   return res.status(200).json({data:{source,status:checkpoint.state,
    processed:checkpoint.indexed,skipped:checkpoint.skipped,pages:checkpoint.page,
    hasMore:Boolean(checkpoint.next),contentComplete:false,
    sourceCoverageCertified:false,actionAuthorized:false}});
  }catch(e){
   const safe=new Set(['GOOGLE_SCOPE_RECONNECT_REQUIRED','GOOGLE_FOUNDER_CONSENT_REQUIRED',
    'GOOGLE_OAUTH_UNAVAILABLE','HISTORY_PROVIDER_UNAVAILABLE','HISTORY_GMAIL_LIST_INVALID',
    'HISTORY_DRIVE_LIST_INVALID','HISTORY_SYNC_CONFLICT','HISTORY_CHECKPOINT_INVALID']);
   return res.status(503).json(apiError(safe.has(e?.message)?e.message:'HISTORY_INDEX_HOLD',
    'Historical indexing unavailable; no unverified completion reported'));
  }
 };
}
export default createHistoricalIndexHandler();
