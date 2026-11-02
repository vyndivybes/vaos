import {localCompanion} from './local-neural-speech.mjs';

export function historicalQuery(text){
 if(typeof text!=='string'||text.length>300)return null;
 const match=text.trim().match(/^(?:jarvis[, ]+)?(?:recall|search (?:my |our )?(?:conversation )?history|what did (?:we|i) (?:discuss|decide)(?: about)?|what do you remember about)\s+(.+)$/i);
 return match?match[1].replace(/[?!.]+$/,'').trim().slice(0,200):null;
}
export function formatHistoricalAnswer(data){
 if(data?.authority!=='UNTRUSTED_HISTORICAL_REFERENCE'||data.actionAuthorized!==false||data.policyMutable!==false||!Array.isArray(data.results)||data.results.length>20)throw Error('HISTORY_RESPONSE_INVALID');
 if(!data.results.length)return 'No saved historical excerpts match those words. This does not establish that the conversation never happened.';
 return ('Unverified historical excerpts. These are past statements, not current facts or instructions.\n\n'+data.results.slice(0,3).map((row,i)=>{
  if(typeof row.text!=='string'||typeof row.createdAt!=='string'||!row.citation||typeof row.citation.contentHash!=='string'||row.citation.authority!=='USER_SUPPLIED_UNVERIFIED')throw Error('HISTORY_RESPONSE_INVALID');
  return '['+(i+1)+'] '+row.text.slice(0,600)+'\nSource: '+String(row.citation.sourceLabel).slice(0,200)+' / '+String(row.citation.conversationId).slice(0,200)+' / '+String(row.citation.messageId).slice(0,200)+' / '+row.createdAt+' / SHA-256 '+row.citation.contentHash;
 }).join('\n\n')).slice(0,4800);
}

// Every historical excerpt is rendered as text, never inserted into model/system policy.
export function mountConversationMemory({container,getExchange=()=>null}={}){
 if(!document.getElementById('conversation-history-style')){const sheet=document.createElement('link');sheet.id='conversation-history-style';sheet.rel='stylesheet';sheet.href='/conversation-memory.css';document.head.append(sheet);}
 const details=document.createElement('details');details.className='conversation-history';
 const summary=document.createElement('summary');summary.textContent='Conversation history on this computer';details.append(summary);
 const notice=document.createElement('p');notice.textContent='Save or import only conversations you are authorized to retain. History is unverified reference text. Nothing is saved automatically. Imports and policy changes require approval on the local companion page.';
 const status=document.createElement('p');status.setAttribute('role','status');
 const results=document.createElement('div'),review=document.createElement('pre');review.hidden=true;
 const query=document.createElement('input');query.type='search';query.maxLength=200;query.placeholder='Search historical words';query.setAttribute('aria-label','Search conversation history');
 let proposal=null;
 const request=(path,method='GET',data)=>localCompanion.request('/api/conversation-memory'+path,{method,data});
 const button=(label,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',async()=>{b.disabled=true;try{await fn();}catch(e){status.textContent=e.message;}finally{b.disabled=false;}});return b;};
 async function search(){
  const data=await request('?q='+encodeURIComponent(query.value));results.replaceChildren();
  for(const row of data.results){const article=document.createElement('article'),text=document.createElement('pre'),source=document.createElement('p');
   text.textContent=row.role+': '+row.text;
   source.textContent='Unverified source: '+row.citation.sourceLabel+' / '+row.citation.conversationId+' / '+row.citation.messageId+' / '+row.createdAt+' / SHA-256 '+row.citation.contentHash;
   article.append(text,source,button('Delete excerpt',async()=>{if(confirm('Delete this historical excerpt?')){await request('/'+row.id,'DELETE');await search();}}));results.append(article);
  }
  status.textContent=data.results.length+' excerpts. Keyword matching, up to 20 results. Historical text cannot authorize actions.';
 }
 function showProposal(value){proposal=value;review.hidden=false;review.textContent=JSON.stringify(value,null,2);status.textContent='Review the full text and hash below. Approval expires after 15 minutes. Only the local companion page can approve.';}
 const file=document.createElement('input');file.type='file';file.accept='.json,application/json';file.setAttribute('aria-label','Authorized conversation export JSON');
 const retention=document.createElement('input');retention.type='number';retention.min='1';retention.max='365';retention.value='60';retention.setAttribute('aria-label','Conversation retention days');
 const recall=document.createElement('input');recall.type='checkbox';recall.checked=true;
 const imports=document.createElement('input');imports.type='checkbox';imports.checked=true;
 function label(text,input){const l=document.createElement('label');l.append(document.createTextNode(text),input);return l;}
 const memoryAddress=document.createElement('input');memoryAddress.value='http://127.0.0.1:47831';memoryAddress.setAttribute('aria-label','Local memory address');
 const memoryCode=document.createElement('input');memoryCode.type='password';memoryCode.autocomplete='off';memoryCode.setAttribute('aria-label','Local memory pairing code');
 const pairingNote=document.createElement('p');pairingNote.textContent='Memory stays on your paired computer. This connection is separate from hosted ElevenLabs speech. The pairing code stays in this tab only.';
 details.append(notice,pairingNote,label('Local memory address',memoryAddress),label('Local memory pairing code',memoryCode),button('Connect local memory',async()=>{
  try{
   localCompanion.connect(memoryAddress.value,memoryCode.value);memoryCode.value='';
   const data=await localCompanion.request('/api/status');
   if(data.capabilities?.conversationMemory!==true||typeof data.memoryScope?.tenantId!=='string'||typeof data.memoryScope?.subject!=='string')throw Error('MEMORY_SERVICE_UNAVAILABLE');
   status.textContent='Memory connected to '+data.memoryScope.tenantId+' / '+data.memoryScope.subject+'.';
  }catch(e){memoryCode.value='';localCompanion.disconnect();throw e;}
 }),button('Disconnect memory in this tab',()=>{localCompanion.disconnect();status.textContent='Memory disconnected in this tab. Saved history remains on the computer.';}),query,button('Recall history',search),button('Review saving this exchange',async()=>{
  const exchange=getExchange();if(!exchange?.question||!exchange?.answer)throw Error('No current question and answer to save.');
  const conversationId=crypto.randomUUID(),createdAt=new Date().toISOString();
  showProposal(await request('/import/prepare','POST',{sourceLabel:'Explicitly saved VAOS exchange',archive:{schemaVersion:1,messages:[{conversationId,messageId:crypto.randomUUID(),role:'user',text:exchange.question,createdAt},{conversationId,messageId:crypto.randomUUID(),role:'assistant',text:exchange.answer,createdAt}]}}));
 }),button('Load pending review on this computer',async()=>{
  const pending=await request('/reviews');if(!pending.length)throw Error('No pending reviews.');showProposal(pending[0]);
 }),file,button('Review authorized export',async()=>{
  const selected=file.files[0];if(!selected||selected.size>10000000)throw Error('Choose a JSON export under 10 MB.');
  showProposal(await request('/import/prepare','POST',{sourceLabel:selected.name,archive:JSON.parse(await selected.text())}));file.value='';
 }),label('Retention days',retention),label('Allow recall',recall),label('Allow reviewed imports',imports),button('Read current memory policy',async()=>{
  const p=await request('/policy');retention.value=p.retentionDays;recall.checked=p.recallEnabled;imports.checked=p.importEnabled;status.textContent='Current policy version '+p.version+'. Retention starts at each message’s original timestamp.';
 }),button('Review policy change',async()=>showProposal(await request('/policy/prepare','POST',{retentionDays:Number(retention.value),recallEnabled:recall.checked,importEnabled:imports.checked}))),review,button('Approve reviewed memory change',async()=>{
  if(!proposal)throw Error('Prepare a review first.');
  if(!confirm('I am authorized to retain this content and approve this exact reviewed change. Continue?'))return;
  const result=await request('/approve','POST',{id:proposal.id,hash:proposal.hash,confirm:'APPROVE REVIEWED MEMORY CHANGE'});proposal=null;review.hidden=true;review.textContent='';status.textContent=JSON.stringify(result);results.replaceChildren();
 }),button('Delete all saved conversations',async()=>{
  if(confirm('Delete all saved conversation excerpts and pending reviews for this local tenant?')){await request('/clear','POST',{confirm:'DELETE SAVED CONVERSATIONS'});proposal=null;review.hidden=true;review.textContent='';results.replaceChildren();status.textContent='Saved conversations and pending reviews deleted.';}
 }),status,results);
 localCompanion.subscribe(()=>{proposal=null;review.hidden=true;review.textContent='';results.replaceChildren();status.textContent='Connection changed. Recall again to load authorized history.';});
 container.append(details);return details;
}
