import {AGENTS,prepareFounderCommand,safeAgentSnapshot} from './founder-command.mjs';
const $=id=>document.getElementById(id),shell=$('founder-shell'),message=$('command-message'),agentSelect=$('agent');
let preparedText='';let pendingMessageId=null;let prepared=null;
for(const agent of AGENTS){const option=document.createElement('option');option.value=agent.id;option.textContent=agent.name;agentSelect.append(option);}
async function refresh(){
 $('agent-status').textContent='Reading persisted agent records…';
 try{
  const response=await fetch('/api/langgraph',{credentials:'same-origin',cache:'no-store'});
  if(!response.ok)throw new Error('MONITOR_UNAVAILABLE');
  const payload=await response.json();
  const a=safeAgentSnapshot(payload?.data?.monitor).find(a=>a.id===agentSelect.value);
  $('agent-status').textContent=a?a.lifecycle+' · '+a.qualification+' · runtime '+a.liveness:'No verified status for selected agent.';
 }catch{$('agent-status').textContent='Agent monitor unavailable. No live status inferred.';}
}
async function authenticate(){
 try{
  const r=await fetch('/api/session',{credentials:'same-origin',cache:'no-store'});
  if(!r.ok){window.location.replace('/login');return;}
  shell.hidden=false;$('auth-message').hidden=true;await refresh();
 }catch{$('auth-message').textContent='Session unavailable. Sign in from workspace.';}
}
agentSelect.addEventListener('change',()=>{$('draft-panel').hidden=true;preparedText='';pendingMessageId=null;prepared=null;refresh();loadHistory();});
$('refresh').addEventListener('click',refresh);
$('command-form').addEventListener('submit',event=>{
 event.preventDefault();
 try{
  const d=prepareFounderCommand({agentId:agentSelect.value,kind:$('command-kind').value,instruction:$('instruction').value});
  prepared=d;pendingMessageId=crypto.randomUUID();
  const a=AGENTS.find(a=>a.id===d.recipientAgentId);
  preparedText='Recipient: '+a.name+' ('+d.recipientAgentId+')\nType: '+d.kind+'\nStatus: DRAFT_NOT_SENT\n\n'+d.instruction+'\n\nRequires governed submission. No authority granted.';
  $('draft-output').textContent=preparedText;$('draft-panel').hidden=false;
  message.textContent='Draft prepared locally. It has NOT been sent to an agent.';
 }catch{message.textContent='Invalid draft. Enter a specific instruction (5–2000 characters).';}
});
async function loadHistory(){
 const out=$('recorded-history');out.replaceChildren();
 const select=$('report-request');select.replaceChildren();
 const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Select persisted report request';select.append(placeholder);
 try{
  const r=await fetch('/api/founder-inbox?agentId='+encodeURIComponent(agentSelect.value),{credentials:'same-origin',cache:'no-store'});
  if(!r.ok)throw Error();
  const data=(await r.json()).data;
  if(!Array.isArray(data?.messages))throw Error();
  if(!data.messages.length){out.textContent='No recorded messages for this employee.';return;}
  for(const m of data.messages){
   if(m.kind==='REPORT_REQUEST'&&m.status==='RECORDED_NOT_ROUTED'
      &&['project','orchestrator'].includes(agentSelect.value)&&typeof m.messageId==='string'){
      const option=document.createElement('option');option.value=m.messageId;
      option.textContent=(m.createdAt||'')+' · '+m.instruction.slice(0,80);select.append(option);
   }
   const p=document.createElement('p');
   p.textContent=(m.createdAt||'')+' · '+m.kind+' · '+m.status+': '+m.instruction;
   out.append(p);
  }
 }catch{out.textContent='Inbox history is not commissioned or is unavailable.';}
}
$('refresh-history').addEventListener('click',loadHistory);
$('prepare-report').addEventListener('click',async()=>{
 const out=$('report-preview');const messageId=$('report-request').value;
 const missionId=$('report-mission-id').value.trim();
 if(!messageId||!missionId){out.textContent='Select a saved report request and mission ID.';return;}
 out.textContent='Checking authoritative evidence…';
 try{
  const r=await fetch('/api/founder-agent-report',{method:'POST',credentials:'same-origin',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({operation:'PREVIEW_MISSION_REPORT',agentId:agentSelect.value,messageId,missionId})});
  if(!r.ok)throw Error();
  const x=(await r.json()).data;
  if(x?.status!=='READ_ONLY_PREVIEW_NOT_AGENT_REPLY'||x.actionAuthorized!==false)throw Error();
  out.textContent='READ-ONLY PREVIEW — NOT AN AI REPLY\nMission: '+x.missionId+
  '\nStatus: '+x.missionStatus+'\nVerified: '+x.verifiedWorkPackages+'/'+x.totalWorkPackages+
  '\nBlockers: '+x.blockedWorkPackageIds.join(', ')+
  '\nEvidence: '+x.evidenceRefs.join(', ')+
  '\nUpdated: '+(x.sourceUpdatedAt||'Not recorded')+'\nNo model invoked. No action authorized.';
 }catch{out.textContent='Report preview unavailable or not commissioned. No agent response inferred.';}
});
$('founder-ai-draft').addEventListener('click',async()=>{
 const out=$('founder-ai-response'),messageId=$('report-request').value;
 const missionId=$('report-mission-id').value.trim();
 if(!messageId||!missionId){out.textContent='First choose a persisted report request and mission ID above.';return;}
 $('founder-ai-draft').disabled=true;out.textContent='Checking Stage 4 read-only AI gate…';
 try{
  const r=await fetch('/api/founder-chat',{method:'POST',credentials:'same-origin',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({operation:'GENERATE_READONLY_DRAFT',agentId:agentSelect.value,messageId,missionId})});
  if(!r.ok)throw Error();
  const x=(await r.json()).data;
  if(x?.reply?.status!=='AI_DRAFT_UNVERIFIED'||x.actionAuthorized!==false)throw Error();
  out.textContent='UNVERIFIED AI DRAFT — NOT AGENT EVIDENCE\n'+x.reply.content+
   '\n\nGrounded evidence references: '+(x.reply.evidenceRefs||[]).join(', ')+
   '\nNo business action authorized.';
 }catch{out.textContent='Stage 4 is disabled or could not produce a verified-persistence draft. No action occurred.';}
 finally{$('founder-ai-draft').disabled=false;}
});
$('record-draft').addEventListener('click',async()=>{
 if(!prepared||!pendingMessageId){message.textContent='Prepare a draft first.';return;}
 // A changed form must never send an older draft without another explicit confirmation.
 if(agentSelect.value!==prepared.recipientAgentId||$('instruction').value.trim()!==prepared.instruction
    ||$('command-kind').value!==prepared.kind){
  message.textContent='Form changed. Prepare the draft again before recording.';return;
 }
 $('record-draft').disabled=true;
 try{
  const r=await fetch('/api/founder-inbox',{method:'POST',credentials:'same-origin',
   headers:{'Content-Type':'application/json'},body:JSON.stringify({
    messageId:pendingMessageId,agentId:prepared.recipientAgentId,
    kind:prepared.kind,instruction:prepared.instruction
   })});
  const payload=await r.json();
  if(!r.ok||payload?.data?.message?.status!=='RECORDED_NOT_ROUTED')throw Error();
  message.textContent='Recorded in founder inbox — NOT ROUTED or executed.';
  pendingMessageId=null;prepared=null;$('draft-panel').hidden=true;
  await loadHistory();
 }catch{
  message.textContent='Recording not confirmed. No agent action occurred. Retry the same prepared draft and ID.';
 }finally{$('record-draft').disabled=false;}
});
$('copy-draft').addEventListener('click',async()=>{
 try{await navigator.clipboard.writeText(preparedText);message.textContent='Draft copied. Not sent.';}
 catch{message.textContent='Clipboard unavailable. Copy the displayed draft manually.';}
});
$('mission-form').addEventListener('submit',async event=>{
 event.preventDefault();const id=$('mission-id').value.trim(),out=$('mission-summary');
 if(!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{3,95}$/.test(id)){out.textContent='Enter a valid existing mission ID.';return;}
 out.textContent='Reading authoritative mission snapshot…';
 try{
  const response=await fetch('/api/missions?missionId='+encodeURIComponent(id),{credentials:'same-origin',cache:'no-store'});
  if(!response.ok)throw new Error('MISSION_UNAVAILABLE');
  const record=(await response.json())?.data;
  if(!record?.mission||record.mission.id!==id||!Array.isArray(record.workPackages))throw new Error('MISSION_INVALID');
  const work=record.workPackages;
  out.textContent='Mission: '+id+'\nStatus: '+(record.mission.status||'UNVERIFIED')+'\nWork packages: '+work.length+'\nCompleted: '+work.filter(p=>p.status==='COMPLETED').length+'\n\nView full evidence in Mission Status.';
 }catch{out.textContent='Mission unavailable. No completion or verification inferred.';}
});

let conversationThreadId=null;
let conversationKey=null;
let pendingConversationPost=null;
function clearConversation(){
 conversationThreadId=null;conversationKey=null;pendingConversationPost=null;
 $('conversation-history').textContent='Load a mission conversation to see its persisted turns.';
 $('conversation-status').textContent='Conversations are separate for each agent and mission.';
}
agentSelect.addEventListener('change',clearConversation);
function selectedConversation(){
 const agentId=agentSelect.value,missionId=$('thread-mission-id').value.trim();
 if(!['project','orchestrator'].includes(agentId)||
    !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{3,95}$/.test(missionId))return null;
 return {agentId,missionId,key:agentId+'|'+missionId};
}
async function loadConversation(){
 const selected=selectedConversation();
 if(!selected){clearConversation();$('conversation-status').textContent='Select Project Controls or Orchestrator and a valid existing mission.';return false;}
 $('conversation-status').textContent='Reading immutable conversation history…';
 try{
  const url='/api/founder-conversation?agentId='+encodeURIComponent(selected.agentId)+'&missionId='+encodeURIComponent(selected.missionId);
  const r=await fetch(url,{credentials:'same-origin',cache:'no-store'});
  if(!r.ok)throw Error();
  const data=(await r.json()).data;
  if(!Array.isArray(data?.turns)||data.agentId!==selected.agentId||
    data.missionId!==selected.missionId||data.actionAuthorized!==false)throw Error();
  if(data.threadId!==null&&!/^[0-9a-f-]{36}$/i.test(data.threadId))throw Error();
  conversationKey=selected.key;conversationThreadId=data.threadId;
  const out=$('conversation-history');out.replaceChildren();
  if(!data.turns.length)out.textContent='No stored turns yet. Start a read-only report conversation.';
  for(const turn of data.turns){
   const block=document.createElement('div');block.className='conversation-turn';
   const heading=document.createElement('strong');
   heading.textContent='Founder · request '+turn.sequence;block.append(heading);
   const request=document.createElement('p');request.textContent=turn.instruction;block.append(request);
   const reply=document.createElement('p');reply.className='conversation-reply';
   reply.textContent=turn.reply?.status==='AI_DRAFT_UNVERIFIED'
    ?'UNVERIFIED AI DRAFT\n'+turn.reply.content+'\nEvidence: '+(turn.reply.evidenceRefs||[]).join(', ')
    :'No independently persisted AI reply. Do not infer completion.';
   block.append(reply);out.append(block);
  }
  $('conversation-status').textContent='Recorded turns: '+data.turns.length+' / 12. No business action authorized.';
  return true;
 }catch{
  conversationKey=null;conversationThreadId=null;
  $('conversation-history').textContent='Conversation unavailable or not commissioned.';
  $('conversation-status').textContent='Read failed closed. No action taken.';
  return false;
 }
}
$('load-conversation').addEventListener('click',loadConversation);
$('send-conversation').addEventListener('click',async()=>{
 const selected=selectedConversation(),instruction=$('conversation-text').value.trim();
 if(!selected||instruction.length<5||instruction.length>900){
  $('conversation-status').textContent='Select a qualified pilot agent, a mission, and a 5–900 character request.';return;
 }
 $('send-conversation').disabled=true;
 try{
  if(conversationKey!==selected.key&&!(await loadConversation()))return;
  const post=pendingConversationPost&&pendingConversationPost.key===selected.key
    &&pendingConversationPost.instruction===instruction
    ?pendingConversationPost
    :{...selected,instruction,threadId:conversationThreadId||crypto.randomUUID(),messageId:crypto.randomUUID()};
  pendingConversationPost=post;
  $('conversation-status').textContent='Recording the immutable founder request…';
  const saved=await fetch('/api/founder-conversation',{method:'POST',credentials:'same-origin',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({threadId:post.threadId,messageId:post.messageId,
      agentId:post.agentId,missionId:post.missionId,instruction:post.instruction})});
  if(!saved.ok)throw Error();
  const payload=(await saved.json()).data;
  if(!['LINKED','REPLAY'].includes(payload?.outcome)||payload.actionAuthorized!==false)throw Error();
  pendingConversationPost=null;conversationThreadId=post.threadId;
  $('conversation-text').value='';
  $('conversation-status').textContent='Request recorded. Generating one evidence-grounded AI draft…';
  // One explicit user click authorizes ONE bounded model request. Never blindly retry.
  const generated=await fetch('/api/founder-chat',{method:'POST',credentials:'same-origin',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({operation:'GENERATE_READONLY_DRAFT',agentId:post.agentId,
      messageId:post.messageId,missionId:post.missionId})});
  if(!generated.ok)throw Error();
  const reply=(await generated.json()).data;
  if(reply?.reply?.status!=='AI_DRAFT_UNVERIFIED'||reply?.actionAuthorized!==false)throw Error();
  await loadConversation();
  $('conversation-status').textContent='Persisted read-only AI draft. No business action authorized.';
 }catch{
  $('conversation-status').textContent='Reply or recording not confirmed. Refresh history before taking any further action; never blindly regenerate.';
 }finally{$('send-conversation').disabled=false;}
});

authenticate();
