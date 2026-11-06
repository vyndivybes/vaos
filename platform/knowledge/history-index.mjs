/** VAOS privately encrypted historical-content corpus.
 * No plaintext objects, provider tokens, unverified auto-sync, public reads,
 * approval propagation, or local disk persistence.
 */
export const HISTORY_SOURCES=Object.freeze([
 'gmail','drive','github','chatgpt','obsidian','graphiti','graphify','vyndios','vaos'
]);
const TYPES=new Set(HISTORY_SOURCES),ROOT='private/history-index/v1/';
const ID=/^[A-Za-z0-9][A-Za-z0-9_.:/#@-]{0,219}$/;
const REL=/^[A-Za-z][A-Za-z0-9_-]{0,49}$/;
const MAX_ITEMS=10000,MAX_SOURCE_BYTES=256*1024*1024,MAX_BATCH=12;
const AAD='vaos:private-historical-index:v1';
const encoder=new TextEncoder(),decoder=new TextDecoder();
const stop=code=>{throw Error('HISTORY_'+code)};
function sourceCheck(source){if(!TYPES.has(source))stop('SOURCE_DENIED');return source;}
const validText=(s,max)=>typeof s==='string'&&s.trim()&&s.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s);
function identifier(s){
 return typeof s==='string'&&ID.test(s)&&!s.split('/').some(x=>x==='..'||x==='.')&&
  !s.includes('://');
}
function validDate(s){return typeof s==='string'&&Number.isFinite(Date.parse(s))?new Date(s).toISOString():null;}
export function normaliseHistoryRecord(source,raw){
 sourceCheck(source);
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||!identifier(raw.id)||
  !validText(raw.title,220)||typeof raw.body!=='string'||
  !validText(raw.sourceRef,420)||!validText(raw.kind,60))stop('RECORD_INVALID');
 if(raw.body.length>64000||encoder.encode(raw.body).length>90000)stop('RECORD_TOO_LARGE');
 if(raw.body.includes('\u0000'))stop('RECORD_INVALID');
 if(raw.modifiedAt!=null&&!validDate(raw.modifiedAt))stop('RECORD_INVALID');
 if(raw.links!=null&&(!Array.isArray(raw.links)||raw.links.length>80))stop('RECORD_INVALID');
 const links=[];
 for(const link of raw.links||[]){
  if(!identifier(link?.targetId)||!REL.test(link?.relation||''))stop('RECORD_INVALID');
  links.push({targetId:link.targetId,relation:link.relation});
 }
 return {id:raw.id,title:raw.title.trim(),body:raw.body,sourceRef:raw.sourceRef.trim(),
  kind:raw.kind.trim(),modifiedAt:raw.modifiedAt?validDate(raw.modifiedAt):null,
  complete:raw.complete===true,links};
}
function guard(env){
 const k=env?.VAOS_GOOGLE_VAULT_KEY,r2=env?.VAOS_ARTIFACTS;
 if(k?.type!=='secret'||k?.extractable!==false||k?.algorithm?.name!=='AES-GCM'||
  k?.algorithm?.length!==256||!k?.usages?.includes('encrypt')||!k?.usages?.includes('decrypt')||
  typeof r2?.get!=='function'||typeof r2?.put!=='function'||typeof r2?.delete!=='function')
  stop('VAULT_UNAVAILABLE');
 return {key:k,r2};
}
function base64(bytes){
 let out='';for(let i=0;i<bytes.length;i+=8192)
  out+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return btoa(out).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function unbase64(v){
 if(typeof v!=='string'||!/.*/.test(v)||!/^[A-Za-z0-9_-]+$/.test(v)||v.length>220000)
  stop('CIPHERTEXT_INVALID');
 const str=atob(v.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-v.length%4)%4));
 return Uint8Array.from(str,c=>c.charCodeAt(0));
}
async function digest(value){
 const bytes=await crypto.subtle.digest('SHA-256',encoder.encode(value));
 return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function seal(payload,key,source){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const bytes=encoder.encode(JSON.stringify(payload));
 const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(AAD+':'+source)},key,bytes);
 return JSON.stringify({v:1,iv:base64(iv),ciphertext:base64(new Uint8Array(ct))});
}
async function open(object,key,source){
 if(!object)return null;
 let row;
 try{
  if(Number.isInteger(object.size)&&object.size>4500000)stop('CIPHERTEXT_INVALID');
  row=JSON.parse(await object.text());
  if(row?.v!==1)stop('CIPHERTEXT_INVALID');
  const iv=unbase64(row.iv),data=unbase64(row.ciphertext);
  if(iv.length!==12)stop('CIPHERTEXT_INVALID');
  const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:encoder.encode(AAD+':'+source)},key,data);
  return JSON.parse(decoder.decode(raw));
 }catch{stop('INTEGRITY_HOLD');}
}
function manifestKey(source){return ROOT+source+'/manifest.enc.json';}
function recordKey(source,hash){return ROOT+source+'/records/'+hash+'.enc.json';}
async function manifestFor(r2,key,source){
 const object=await r2.get(manifestKey(source));
 const data=await open(object,key,source);
 if(data==null)return {manifest:{v:1,source,items:[],bytes:0,cursor:null,complete:false},etag:null};
 if(data.v!==1||data.source!==source||!Array.isArray(data.items)||data.items.length>MAX_ITEMS||
  !Number.isSafeInteger(data.bytes)||data.bytes<0)stop('MANIFEST_INVALID');
 return {manifest:data,etag:object.httpEtag||null};
}
async function commitManifest(r2,key,source,manifest,etag){
 const body=await seal(manifest,key,source);
 const onlyIf=etag?new Headers({'If-Match':etag}):new Headers({'If-None-Match':'*'});
 const result=await r2.put(manifestKey(source),body,{onlyIf,
  httpMetadata:{contentType:'application/json'}});
 if(!result)stop('CONCURRENT_MODIFICATION');
}
export function createHistoricalStore(env){
 async function ingest(source,input){
  sourceCheck(source);const {key,r2}=guard(env);
  if(!Array.isArray(input)||input.length<1||input.length>MAX_BATCH)stop('BATCH_DENIED');
  const records=input.map(r=>normaliseHistoryRecord(source,r));
  if(new Set(records.map(r=>r.id)).size!==records.length)stop('DUPLICATE_ID');
  const {manifest,etag}=await manifestFor(r2,key,source);
  let added=0,updated=0,unchanged=0;
  for(const record of records){
   const idHash=await digest(source+':'+record.id);
   const hash=await digest(JSON.stringify(record));
   const previous=manifest.items.find(x=>x.idHash===idHash);
   if(previous?.hash===hash){unchanged++;continue;}
   const encrypted=await seal(record,key,source);
   const bytes=encoder.encode(encrypted).length;
   const size=manifest.bytes-(previous?.bytes||0)+bytes;
   if((!previous&&manifest.items.length>=MAX_ITEMS)||size>MAX_SOURCE_BYTES)stop('FREE_TIER_CAP_REACHED');
   await r2.put(recordKey(source,idHash),encrypted,{httpMetadata:{contentType:'application/json'}});
   if(previous){previous.hash=hash;previous.bytes=bytes;updated++;}
   else{manifest.items.push({idHash,hash,bytes});added++;}
   manifest.bytes=size;
  }
  manifest.lastIngestedAt=new Date().toISOString();
  await commitManifest(r2,key,source,manifest,etag);
  return {status:'OBSERVED',source,added,updated,unchanged,
   itemCount:manifest.items.length,complete:manifest.complete===true,
   readOnly:true,actionAuthorized:false};
 }
 async function status(){
  const {key,r2}=guard(env);
  const sources=[];
  for(const source of HISTORY_SOURCES){
   const {manifest}=await manifestFor(r2,key,source);
   sources.push({source,items:manifest.items.length,bytes:manifest.bytes,
    cursorAvailable:Boolean(manifest.cursor),complete:manifest.complete===true,
    observedAt:manifest.lastIngestedAt||null});
  }
  return {status:'OBSERVED',sources,encrypted:true,readOnly:true,actionAuthorized:false};
 }
 async function progress(source){
  sourceCheck(source);const {key,r2}=guard(env);
  const {manifest}=await manifestFor(r2,key,source);
  return {cursor:manifest.cursor||null,complete:manifest.complete===true,count:manifest.items.length};
 }
 async function checkpoint(source,cursor,complete){
  sourceCheck(source);const {key,r2}=guard(env);
  if(cursor!==null&&(typeof cursor!=='string'||cursor.length>700))stop('CURSOR_INVALID');
  const {manifest,etag}=await manifestFor(r2,key,source);
  manifest.cursor=cursor;manifest.complete=complete===true;
  await commitManifest(r2,key,source,manifest,etag);
  return {complete:manifest.complete,hasMore:Boolean(manifest.cursor)};
 }
 async function read(source,id){
  sourceCheck(source);const {key,r2}=guard(env);
  if(!identifier(id))stop('RECORD_INVALID');
  const {manifest}=await manifestFor(r2,key,source);
  const idHash=await digest(source+':'+id);
  if(!manifest.items.some(x=>x.idHash===idHash))return null;
  const row=await open(await r2.get(recordKey(source,idHash)),key,source);
  if(!row||row.id!==id)stop('INTEGRITY_HOLD');
  return {...row,source,actionAuthorized:false};
 }
 async function search({sources=HISTORY_SOURCES,query,cursor=0,limit=12}={}){
  if(!Array.isArray(sources)||sources.length<1||sources.length>HISTORY_SOURCES.length||
   sources.some(x=>!TYPES.has(x))||new Set(sources).size!==sources.length)stop('SOURCE_DENIED');
  if(typeof query!=='string'||query.trim().length<2||query.length>120)stop('QUERY_DENIED');
  if(!Number.isSafeInteger(cursor)||cursor<0||!Number.isInteger(limit)||limit<1||limit>20)stop('CURSOR_INVALID');
  const {key,r2}=guard(env);
  const entries=[];
  for(const source of sources){
   const {manifest}=await manifestFor(r2,key,source);
   for(const row of manifest.items)entries.push({source,idHash:row.idHash});
  }
  if(cursor>entries.length)stop('CURSOR_INVALID');
  const terms=query.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]{2,}/gu)||[];
  if(!terms.length||terms.length>12)stop('QUERY_DENIED');
  const matches=[];
  const end=Math.min(entries.length,cursor+limit);
  for(let i=cursor;i<end;i++){
   const item=entries[i];
   const row=await open(await r2.get(recordKey(item.source,item.idHash)),key,item.source);
   if(!row)stop('INTEGRITY_HOLD');
   const haystack=(row.title+' '+row.body).normalize('NFKC').toLowerCase();
   if(!terms.every(t=>haystack.includes(t)))continue;
   const offset=Math.max(0,haystack.indexOf(terms[0]));
   matches.push({id:row.id,source:item.source,title:row.title,kind:row.kind,
    sourceRef:row.sourceRef,modifiedAt:row.modifiedAt,complete:row.complete===true,
    excerpt:(row.title+' '+row.body).slice(Math.max(0,offset-70),offset+190),
    links:row.links||[]});
  }
  return {status:'OBSERVED',matches,scanned:end-cursor,totalIndexed:entries.length,
   nextCursor:end<entries.length?end:null,complete:end===entries.length,
   readOnly:true,actionAuthorized:false};
 }
 async function purge(source,{limit=20}={}){
  sourceCheck(source);const {key,r2}=guard(env);
  if(!Number.isInteger(limit)||limit<1||limit>50)stop('PURGE_LIMIT_DENIED');
  const {manifest,etag}=await manifestFor(r2,key,source);
  const removing=manifest.items.splice(0,limit);
  for(const item of removing){await r2.delete(recordKey(source,item.idHash));manifest.bytes-=item.bytes;}
  if(!manifest.items.length){
   await r2.delete(manifestKey(source));
  }else await commitManifest(r2,key,source,manifest,etag);
  return {source,deleted:removing.length,remaining:manifest.items.length,actionAuthorized:false};
 }
 return {ingest,status,progress,checkpoint,read,search,purge};
}
