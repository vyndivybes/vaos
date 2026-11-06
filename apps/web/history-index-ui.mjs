import {parseConversationExport,parseMarkdownNote,parseKnowledgeExport} from './lib/historical-import.mjs';

const $=id=>document.getElementById(id);
const SOURCES=['gmail','drive','github','chatgpt','obsidian','graphiti','graphify','vyndios','vaos'];
const LABELS={gmail:'Gmail',drive:'Google Drive',github:'GitHub',chatgpt:'ChatGPT history',
 obsidian:'Obsidian vault',graphiti:'Graphiti facts',graphify:'Graphify codebase',
 vyndios:'VYNDI OS',vaos:'VAOS'};
let queryState=null,searching=false;
const notice=(message,blocked=false)=>{
 const node=$('history-index-status');node.textContent=message;
 node.classList.toggle('is-hold',blocked);
};
async function request(path,options={}){
 const response=await fetch('/api/history-index'+path,{credentials:'same-origin',cache:'no-store',
  headers:{Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{})},
  ...options,body:options.body?JSON.stringify(options.body):undefined});
 const data=await response.json();
 if(!response.ok)throw Error(data?.error?.code||data?.reason||'HISTORY_HTTP_'+response.status);
 return data.data||data;
}
async function refresh(){
 try{
  const d=await request('/status');
  const list=$('history-index-sources');list.replaceChildren();
  for(const source of SOURCES){
   const info=d.sources?.find(x=>x.source===source);
   const card=document.createElement('div');card.className='history-source-state';
   const title=document.createElement('strong');title.textContent=LABELS[source];
   const count=document.createElement('span');count.textContent=(info?.items??0)+' encrypted records';
   const state=document.createElement('small');state.textContent=source==='gmail'||source==='drive'||source==='github'?
    info?.complete?'Enumeration complete · content coverage may be partial':
    info?.cursorAvailable?'Backfill resumable':'Not fully enumerated':
    'Explicit source export required';
   card.append(title,count,state);list.append(card);
  }
  notice('Encrypted storage checked. Indexed totals are source-specific; an empty or incomplete source is not represented as live.');
 }catch(error){
  notice('Historical index HOLD: '+String(error.message||'UNAVAILABLE')+
   '. Verify founder session, vault key and R2 binding.',true);
 }
}
async function syncGoogle(source){
 const button=$(source==='gmail'?'history-index-sync-gmail':source==='drive'?'history-index-sync-drive':'history-index-sync-github');
 button.disabled=true;let processed=0,stages=0,completed=false;
 try{
  // Foreground-only, bounded execution: never silently exhaust free-tier quotas.
  for(let i=0;i<15;i++){
   const body={source};
   if(i===0&&$('history-index-restart').checked)body.restart=true;
   const result=await request('/sync',{method:'POST',body});
   processed+=result.indexedThisStep||0;stages++;
   completed=result.enumerationComplete===true;
   notice(LABELS[source]+': '+processed+' records examined across '+stages+
    ' bounded source pages. '+(completed?'Pagination completed; unsupported content remains partial.':
     'More history available; continue with this button.'));
   if(completed)break;
  }
  await refresh();
  notice(LABELS[source]+': '+processed+' items processed in this request; '+
   (completed?'source enumeration complete':'continue to resume historical enumeration')+
   '. Source bodies are encrypted before storage.');
 }catch(error){
  notice(LABELS[source]+' synchronization HOLD after '+processed+
   ' records: '+String(error.message||'UNAVAILABLE')+
   '. Reconnect historical Google permission if required.',true);
 }finally{button.disabled=false;}
}
function sourceImport(){
 const value=$('history-index-import-source').value;
 if(!['chatgpt','obsidian','graphiti','graphify','github','vyndios','vaos'].includes(value))
  throw Error('SOURCE_DENIED');
 return value;
}
async function collectFiles(source,files){
 const rows=[];
 if(!files.length)throw Error('SELECT_EXPORT_FILE');
 for(const file of files){
  if(file.size>80000000)throw Error('SOURCE_EXPORT_EXCEEDS_80_MB');
  if(source==='obsidian'&&/\.md$/i.test(file.name)){
   rows.push(await parseMarkdownNote(file.webkitRelativePath||file.name,await file.text()));
  }else{
   if(!/\.json$/i.test(file.name))throw Error('JSON_EXPORT_REQUIRED');
   const data=JSON.parse(await file.text());
   if(source==='chatgpt')rows.push(...parseConversationExport(data));
   else rows.push(...await parseKnowledgeExport(source,data));
  }
  if(rows.length>45000)throw Error('EXPORT_TOO_LARGE');
 }
 return rows;
}
async function importFiles(event){
 event.preventDefault();
 const button=$('history-index-import-submit'),input=$('history-index-file');
 let count=0;
 button.disabled=true;
 try{
  const source=sourceImport();
  const selectedFiles=[...input.files,...$('history-index-folder').files];
  const rows=await collectFiles(source,selectedFiles);
  if(!rows.length)throw Error('EXPORT_CONTAINS_NO_SUPPORTED_RECORDS');
  const seen=new Set();
  for(const row of rows){
   if(seen.has(row.id))throw Error('DUPLICATE_SOURCE_RECORD');
   seen.add(row.id);
  }
  for(let i=0;i<rows.length;i+=8){
   const batch=rows.slice(i,i+8);
   await request('/ingest',{method:'POST',body:{source,records:batch}});
   count+=batch.length;
   notice('Encrypting '+LABELS[source]+': '+count+'/'+rows.length+
    ' records stored in private VAOS. No plaintext upload to GitHub.');
  }
  await refresh();
  notice('Imported '+count+' '+LABELS[source]+' records into the private encrypted index. '+
   'Export content is searchable only in a founder session.');
 }catch(error){
  notice('Historical import HOLD after '+count+' records: '+String(error.message||'UNAVAILABLE')+
   '. Already indexed records remain idempotent and can be resumed.',true);
 }finally{button.disabled=false;input.value='';$('history-index-folder').value='';}
}
function showResults(){
 const output=$('history-index-results');output.replaceChildren();
 if(!queryState)return;
 const rows=queryState.results.slice(0,200);
 for(const record of rows){
  const article=document.createElement('article');article.className='history-result';
  const title=document.createElement('h3');title.textContent=record.title;
  const meta=document.createElement('p');meta.textContent=LABELS[record.source]+
   ' · '+(record.modifiedAt||'undated')+
   (record.complete?' · Text captured':' · Partial content');
  const excerpt=document.createElement('p');excerpt.textContent=record.excerpt||'No textual excerpt.';
  const button=document.createElement('button');button.type='button';button.textContent='Read indexed record';
  button.addEventListener('click',async()=>{
   button.disabled=true;
   try{
    const recordData=await request('/read?source='+encodeURIComponent(record.source)+
     '&id='+encodeURIComponent(record.id));
    const box=$('history-index-contents');
    box.replaceChildren();
    const heading=document.createElement('h3');heading.textContent=recordData.title;
    const note=document.createElement('p');note.textContent=recordData.sourceRef+
     (recordData.complete?' · captured text':' · source content incomplete');
    const pre=document.createElement('pre');pre.textContent=recordData.body;
    box.append(heading,note,pre);
   }catch(error){notice('Record read HOLD: '+String(error.message||'UNAVAILABLE'),true);}
   finally{button.disabled=false;}
  });
  article.append(title,meta,excerpt,button);output.append(article);
 }
 if(queryState.results.length>200){
  const note=document.createElement('p');
  note.textContent='Displaying the first 200 matches. Refine the query for more detail.';
  output.append(note);
 }
 const more=$('history-index-search-more');
 more.disabled=queryState.complete;
 more.hidden=queryState.complete;
}
async function scan(){
 if(searching||!queryState||queryState.complete)return;
 searching=true;
 const button=$('history-index-search-more');button.disabled=true;
 let scanned=0;
 try{
  // 12 limited pages per user action, at most 240 decrypted documents scanned.
  for(let i=0;i<12;i++){
   const args=new URLSearchParams({q:queryState.query,
    sources:queryState.source==='all'?SOURCES.join(','):queryState.source,
    cursor:String(queryState.cursor),limit:'20'});
   const d=await request('/search?'+args.toString());
   if(d.status!=='OBSERVED'||!Array.isArray(d.matches))throw Error('SEARCH_EVIDENCE_INVALID');
   queryState.results.push(...d.matches);scanned+=d.scanned;
   queryState.complete=d.complete===true;
   queryState.cursor=d.nextCursor??0;
   if(queryState.complete)break;
  }
  notice('Searched '+scanned+' additional encrypted records; '+queryState.results.length+
   ' total matches. '+(queryState.complete?'All selected indexed records scanned.':
    'Additional indexed documents remain; use Scan more.'));
  showResults();
  window.dispatchEvent(new CustomEvent('vaos:history-search-results',{
   detail:{records:queryState.results.slice(0,350)}}));
 }catch(error){notice('Encrypted search HOLD: '+String(error.message||'UNAVAILABLE'),true);}
 finally{searching=false;button.disabled=queryState?.complete??true;}
}
function startSearch(event){
 event.preventDefault();
 const query=$('history-index-q').value.trim(),source=$('history-index-filter').value;
 if(query.length<2||query.length>120||!['all',...SOURCES].includes(source)){
  notice('Provide 2–120 query characters and a permitted source.',true);return;
 }
 queryState={query,source,cursor:0,complete:false,results:[]};
 $('history-index-contents').replaceChildren();
 showResults();void scan();
}
$('history-index-refresh').addEventListener('click',refresh);
$('history-index-sync-gmail').addEventListener('click',()=>syncGoogle('gmail'));
$('history-index-sync-drive').addEventListener('click',()=>syncGoogle('drive'));
$('history-index-sync-github').addEventListener('click',()=>syncGoogle('github'));
$('history-index-import').addEventListener('submit',importFiles);
$('history-index-search').addEventListener('submit',startSearch);
$('history-index-search-more').addEventListener('click',scan);
void refresh();
