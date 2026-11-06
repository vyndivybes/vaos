/** Founder-only incremental search over encrypted private history records.
 * No public index, unencrypted search table, or unbounded R2 scan.
 */
import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {apiError} from '../lib/api-contracts.mjs';
import {featureControl} from '../lib/feature-flags.mjs';
import {openRecord} from './historical-knowledge-index.mjs';
const FOUNDER='shyamsundhar1982@gmail.com';
const PREFIX='runtime/history-index/v1/records/';
export function validateHistorySearch(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||
 Object.keys(value).some(k=>!['source','query','cursor'].includes(k))||
 !['gmail','drive'].includes(value.source)||
 typeof value.query!=='string'||value.query.trim().length<3||value.query.length>90||
 /[\u0000-\u001f\u007f]/.test(value.query)||
 (value.cursor!=null&&(typeof value.cursor!=='string'||value.cursor.length>1500)))
 throw Error('HISTORY_SEARCH_INVALID');
 return {source:value.source,query:value.query.trim(),cursor:value.cursor||null};
}
export function searchHistoryRecord(record,query){
 const name=String(record?.subject||record?.title||'');
 const text=String(record?.text||'').slice(0,10000);
 const combined=name+' '+String(record?.description||'')+' '+text;
 const term=query.toLowerCase(),at=combined.toLowerCase().indexOf(term);
 if(at<0)return null;
 const start=Math.max(0,at-80);
 return {source:record.source,id:record.id,label:name.slice(0,180),
  kind:record.kind,observedAt:record.observedAt||null,
  sourceRef:record.source+':'+record.id,
  excerpt:combined.slice(start,start+220).replace(/[\u0000-\u001f\u007f]/g,' ')};
}
export function createHistoricalSearchHandler({}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='POST')return res.status(405).json(apiError('METHOD_NOT_ALLOWED','POST required'));
  const session=verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]);
  if(!session)return res.status(401).json(apiError('UNAUTHENTICATED','Founder session required'));
  if(session.email!==FOUNDER)return res.status(403).json(apiError('FOUNDER_ONLY','Founder access required'));
  const env=req.env||{};
  if(featureControl(env,'VAOS_HISTORICAL_INDEX_CONTROL')!=='founder-manual-encrypted-v1')
   return res.status(409).json(apiError('HISTORY_SEARCH_DISABLED','Historical search not commissioned'));
  const origin=new URL(req.url,'https://vaos.local').origin;
  if(req.headers?.origin!==origin)return res.status(403).json(apiError('ORIGIN_DENIED','Same-origin request required'));
  let input;
  try{input=validateHistorySearch(req.body);
   if(new URL(req.url,'https://vaos.local').searchParams.size)throw Error();}
  catch{return res.status(422).json(apiError('HISTORY_SEARCH_INVALID','Invalid search parameters'));}
  const bucket=env.VAOS_ARTIFACTS,key=env.VAOS_GOOGLE_VAULT_KEY;
  if(typeof bucket?.list!=='function'||typeof bucket?.get!=='function'||
   key?.type!=='secret'||key?.algorithm?.name!=='AES-GCM')
   return res.status(503).json(apiError('HISTORY_SEARCH_STORAGE_HOLD','Encrypted record store unavailable'));
  try{
   const prefix=PREFIX+input.source+'/';
   const batch=await bucket.list({prefix,limit:20,...(input.cursor?{cursor:input.cursor}:{})});
   if(!Array.isArray(batch.objects))throw Error();
   const matches=[];
   for(const item of batch.objects){
    if(matches.length>=15)break;
    if(!item?.key?.startsWith(prefix)||!item.key.endsWith('.json'))continue;
    const blob=await bucket.get(item.key);
    if(!blob||blob.size>40000)continue;
    const record=await openRecord(JSON.parse(await blob.text()),key);
    if(record.source!==input.source)continue;
    const found=searchHistoryRecord(record,input.query);
    if(found)matches.push(found);
   }
   return res.status(200).json({data:{
    source:input.source,results:matches,hasMore:batch.truncated===true,
    nextCursor:batch.truncated===true?batch.cursor:null,
    scanned:batch.objects.length,coverageComplete:batch.truncated!==true,
    archiveComplete:false,readOnly:true,actionAuthorized:false
   }});
  }catch{
   return res.status(503).json(apiError('HISTORY_SEARCH_HOLD','Encrypted history search unavailable'));
  }
 };
}
export default createHistoricalSearchHandler();
