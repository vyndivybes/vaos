/** Bounded Google full-text history readers. Tokens never enter result objects,
 * logs, query parameters, R2 keys or client responses.
 * Unsupported binaries are indexed as incomplete metadata, not invented text.
 */
const MAIL='https://gmail.googleapis.com/gmail/v1/users/me/messages';
const DRIVE='https://www.googleapis.com/drive/v3/files';
const DOC='application/vnd.google-apps.document';
const SHEET='application/vnd.google-apps.spreadsheet';
const PRESENTATION='application/vnd.google-apps.presentation';
const CONTENT_LIMIT=64000;
const CLEAN=s=>String(s||'').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,220).trim();
const URL_ID=/^[A-Za-z0-9_-]{5,200}$/;
function invalid(code){throw Error('HISTORY_GOOGLE_'+code)}
function safeCursor(value){
 if(value==null||value==='')return null;
 if(typeof value!=='string'||value.length>700||!/^[A-Za-z0-9_./+=-]+$/.test(value))
  invalid('CURSOR_DENIED');
 return value;
}
async function googleJSON(url,token,fetchImpl){
 const response=await fetchImpl(url,{method:'GET',redirect:'manual',
  headers:{Authorization:'Bearer '+token,Accept:'application/json'},
  signal:AbortSignal.timeout(9000)});
 if(response.status!==200)invalid(response.status===429?'RATE_LIMITED':response.status===401||response.status===403?
  'PERMISSION_DENIED':'SOURCE_UNAVAILABLE');
 try{return await response.json();}catch{invalid('RESPONSE_INVALID')}
}
function decode(v){
 if(typeof v!=='string'||v.length>180000)return '';
 try{
  const raw=atob(v.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-v.length%4)%4));
  return new TextDecoder('utf-8').decode(Uint8Array.from(raw,c=>c.charCodeAt(0))).replace(/\u0000/g,'');
 }catch{return ''}
}
function mailContents(payload){
 const plain=[],html=[];let attachments=false;
 function visit(part,depth){
  if(!part||depth>9)return;
  if(part.filename){attachments=true;return;}
  if(typeof part.body?.data==='string'){
   if(part.mimeType==='text/plain')plain.push(decode(part.body.data));
   if(part.mimeType==='text/html')html.push(decode(part.body.data));
  }
  if(Array.isArray(part.parts))for(const child of part.parts.slice(0,100))visit(child,depth+1);
 }
 visit(payload,0);
 if(plain.length)return {text:plain.join('\n').trim(),complete:!attachments};
 if(html.length){
  const stripped=html.join('\n').replace(/<style[\s\S]*?<\/style>/gi,' ')
   .replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<[^>]{0,2000}>/g,' ')
   .replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>');
  return {text:stripped.trim(),complete:false};
 }
 return {text:'',complete:false};
}
function iso(raw){
 const n=Number(raw);
 if(Number.isFinite(n)&&n>1000000000000&&n<9999999999999)return new Date(n).toISOString();
 return null;
}
async function gmailPage(token,cursor,fetchImpl){
 const search=new URLSearchParams({maxResults:'8'});
 if(cursor)search.set('pageToken',cursor);
 const list=await googleJSON(MAIL+'?'+search,token,fetchImpl);
 if(!Array.isArray(list.messages)&&list.resultSizeEstimate!==0)invalid('GMAIL_LIST_INVALID');
 const rows=[];
 for(const item of (list.messages||[]).slice(0,8)){
  if(!URL_ID.test(item?.id||''))invalid('GMAIL_ID_INVALID');
  const message=await googleJSON(MAIL+'/'+encodeURIComponent(item.id)+'?format=full',token,fetchImpl);
  if(message.id!==item.id)invalid('GMAIL_DETAIL_INVALID');
  const headers=Array.isArray(message.payload?.headers)?message.payload.headers:[];
  const header=name=>CLEAN(headers.find(h=>String(h?.name||'').toLowerCase()===name)?.value);
  const extracted=mailContents(message.payload);
  const body=extracted.text||String(message.snippet||'').replace(/\u0000/g,'');
  rows.push({id:message.id,title:header('subject')||'No subject',
   body:body.slice(0,CONTENT_LIMIT),sourceRef:'gmail:'+message.id,kind:'mail_message',
   modifiedAt:iso(message.internalDate),complete:extracted.complete&&body.length<=CONTENT_LIMIT,
   links:[]});
 }
 return {records:rows,nextCursor:safeCursor(list.nextPageToken),complete:!list.nextPageToken,
  source:'gmail',readOnly:true,actionAuthorized:false};
}
const TEXT_FORMATS=new Set(['text/plain','text/markdown','text/csv','application/json','application/xml','text/xml']);
async function downloadText(url,token,fetchImpl){
 const response=await fetchImpl(url,{method:'GET',redirect:'manual',
  headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(9000)});
 if(response.status===404||response.status===415)return {text:'',complete:false};
 if(response.status!==200)invalid(response.status===429?'RATE_LIMITED':response.status===401||response.status===403?
  'PERMISSION_DENIED':'SOURCE_UNAVAILABLE');
 const length=Number(response.headers.get('content-length'));
 if(Number.isFinite(length)&&length>200000)return {text:'',complete:false};
 const text=(await response.text()).replace(/\u0000/g,'');
 return {text:text.slice(0,CONTENT_LIMIT),complete:text.length<=CONTENT_LIMIT};
}
async function drivePage(token,cursor,fetchImpl){
 const params=new URLSearchParams({q:'trashed = false',pageSize:'8',
  fields:'nextPageToken,files(id,name,mimeType,modifiedTime,description,size)',
  orderBy:'modifiedTime desc'});
 if(cursor)params.set('pageToken',cursor);
 const list=await googleJSON(DRIVE+'?'+params,token,fetchImpl);
 if(!Array.isArray(list.files))invalid('DRIVE_LIST_INVALID');
 const rows=[];
 for(const file of list.files.slice(0,8)){
  if(!URL_ID.test(file?.id||'')||typeof file.name!=='string')invalid('DRIVE_ITEM_INVALID');
  const mime=String(file.mimeType||'');
  const document={text:'',complete:false};
  let extracted=document;
  if(mime===DOC||mime===PRESENTATION||mime===SHEET){
   const format=mime===SHEET?'text/csv':'text/plain';
   extracted=await downloadText(DRIVE+'/'+encodeURIComponent(file.id)+'/export?'+
    new URLSearchParams({mimeType:format}),token,fetchImpl);
   if(mime===SHEET)extracted.complete=false; // CSV exports only the first worksheet.
  }else if(TEXT_FORMATS.has(mime)){
   extracted=await downloadText(DRIVE+'/'+encodeURIComponent(file.id)+'?alt=media',token,fetchImpl);
  }
  rows.push({id:file.id,title:CLEAN(file.name)||'Untitled Drive file',
   body:extracted.text,kind:mime==='application/vnd.google-apps.folder'?'folder':'drive_file',
   sourceRef:'drive:'+file.id,modifiedAt:typeof file.modifiedTime==='string'?file.modifiedTime:null,
   complete:extracted.complete,links:[]});
 }
 return {records:rows,nextCursor:safeCursor(list.nextPageToken),complete:!list.nextPageToken,
  source:'drive',readOnly:true,actionAuthorized:false};
}
export async function readGoogleHistoryPage({source,token,cursor=null,fetchImpl=globalThis.fetch}={}){
 if(!['gmail','drive'].includes(source))invalid('SOURCE_DENIED');
 if(typeof token!=='string'||token.length<8)invalid('TOKEN_UNAVAILABLE');
 const page=safeCursor(cursor);
 return source==='gmail'?gmailPage(token,page,fetchImpl):drivePage(token,page,fetchImpl);
}
