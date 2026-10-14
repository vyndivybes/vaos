import {AGENTS,prepareFounderCommand,safeAgentSnapshot} from './founder-command.mjs';
import {formatMissionSnapshotSpokenPreview} from './lib/voice-pilot.mjs';
import {createFounderMission,runFounderMissionSafe,formatFounderMissionResults} from './lib/founder-mission-flow.mjs';
const $=id=>document.getElementById(id),shell=$('founder-shell'),message=$('command-message'),agentSelect=$('agent');
let preparedText='';let pendingMessageId=null;let prepared=null;
for(const agent of AGENTS){const option=document.createElement('option');option.value=agent.id;option.textContent=agent.name;agentSelect.append(option);}

const commandKind=$('command-kind');
function syncInstructionRecipient(){
 const missionInstruction=commandKind.value==='INSTRUCTION';
 if(missionInstruction)agentSelect.value='orchestrator';
 agentSelect.disabled=missionInstruction;
 $('record-draft').textContent='Record in VAOS inbox';
 $('founder-command-submit').textContent=missionInstruction?'Create and assign mission':'Prepare command draft';
 preparedText='';pendingMessageId=null;prepared=null;
 $('draft-panel').hidden=true;
}
commandKind.addEventListener('change',()=>{syncInstructionRecipient();refresh();loadHistory();});
syncInstructionRecipient();

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
  // Mission ID is only a locator: all evidence must be read again under session auth.
  const resumed=new URL(window.location.href).searchParams.get('missionId');
  if(resumed&&/^[a-zA-Z0-9][a-zA-Z0-9._:-]{3,95}$/.test(resumed)){
   $('mission-id').value=resumed;
   await loadFounderMission(resumed);
  }
 }catch{$('auth-message').textContent='Session unavailable. Sign in from workspace.';}
}
agentSelect.addEventListener('change',()=>{$('draft-panel').hidden=true;preparedText='';pendingMessageId=null;prepared=null;refresh();loadHistory();});
$('refresh').addEventListener('click',refresh);
$('command-form').addEventListener('submit',async event=>{
 event.preventDefault();
 try{
  const d=prepareFounderCommand({agentId:agentSelect.value,kind:commandKind.value,instruction:$('instruction').value});
  if(d.kind==='INSTRUCTION'){
   // Explicit submission is sufficient for the permitted mission-only action.
   // Keep the original message ID on retry, even when inbox recording succeeded
   // but assignment response was interrupted. A changed instruction gets a new ID.
   if(!prepared||prepared.kind!==d.kind||prepared.instruction!==d.instruction
      ||prepared.recipientAgentId!==d.recipientAgentId){
    prepared=d;pendingMessageId=crypto.randomUUID();
   }
   await issueFounderInstruction();
   return;
  }
  prepared=d;pendingMessageId=crypto.randomUUID();
  const a=AGENTS.find(a=>a.id===d.recipientAgentId);
  preparedText='Recipient: '+a.name+' ('+d.recipientAgentId+')\nType: '+d.kind+
   '\nStatus: DRAFT_NOT_SENT\n\n'+d.instruction+
   '\n\nRequires governed submission. No authority granted.';
  $('draft-output').textContent=preparedText;$('draft-panel').hidden=false;
  message.textContent='Draft prepared locally. It has NOT been sent to an agent.';
 }catch{
  message.textContent='Invalid instruction. Enter a specific request (5–2000 characters).';
 }
});

async function issueFounderInstruction(){
 const submit=$('founder-command-submit');
 submit.disabled=true;
 message.textContent='Recording founder instruction and assigning permitted departmental work…';
 try{
  const mission=await createFounderMission({
   command:prepared,messageId:pendingMessageId,request:fetch,
  });
  const id=mission.missionId;
  // Recording and planning succeeded. Never re-submit this instruction merely
  // because subsequent GET readback or history rendering is unavailable.
  prepared=null;pendingMessageId=null;preparedText='';
  $('instruction').value='';$('draft-panel').hidden=true;
  $('mission-id').value=id;
  invalidateMissionVoiceReadback();
  const url=new URL(window.location.href);
  url.searchParams.set('missionId',id);
  window.history.replaceState(null,'',url);
  // Start only the existing safe mission consumer after durable assignment.
  // Failure here must NOT be treated as failed mission creation or cause
  // accidental duplicate dispatch. The hourly scheduler resumes queued work.
  message.textContent='Mission assigned: '+mission.assignedWorkPackages+'/'+
    mission.totalWorkPackages+' eligible departments. Running permitted tasks…';
  try{
   const safe=await runFounderMissionSafe({missionId:id,request:fetch});
   message.textContent='Mission assigned: '+mission.assignedWorkPackages+'/'+mission.totalWorkPackages+
    ' departments. Safe pass: '+safe.submitted+' submitted, '+safe.verified+
    ' independently reviewed, '+safe.held+' source holds. Other work continues on the existing schedule.';
  }catch{
   message.textContent='Mission assigned: '+mission.assignedWorkPackages+'/'+
    mission.totalWorkPackages+
    ' departments. Immediate execution not confirmed; the existing hourly scheduler will continue permitted work.';
  }
  await loadFounderMission(id);
  await loadHistory();
 }catch{
  message.textContent='Mission routing not confirmed. Submit the same unchanged instruction to retry safely; the recorded request ID is retained.';
 }finally{submit.disabled=false;}
}

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
 // Reports and override proposals remain separately recorded without routing.
 if(!prepared||!pendingMessageId||prepared.kind==='INSTRUCTION'){
  message.textContent='Use Create and assign mission for direct founder instructions.';return;
 }
 if(agentSelect.value!==prepared.recipientAgentId||$('instruction').value.trim()!==prepared.instruction
    ||commandKind.value!==prepared.kind){
  message.textContent='Form changed. Prepare the draft again before recording.';return;
 }
 $('record-draft').disabled=true;
 try{
  const r=await fetch('/api/founder-inbox',{method:'POST',credentials:'same-origin',
   headers:{'Content-Type':'application/json'},body:JSON.stringify({
    messageId:pendingMessageId,agentId:prepared.recipientAgentId,
    kind:prepared.kind,instruction:prepared.instruction,
   })});
  const payload=await r.json();
  if(!r.ok||payload?.data?.message?.status!=='RECORDED_NOT_ROUTED')throw Error();
  pendingMessageId=null;prepared=null;preparedText='';$('draft-panel').hidden=true;
  message.textContent='Recorded in founder inbox; report or override was not executed.';
  await loadHistory();
 }catch{
  message.textContent='Recording unconfirmed. Retry the unchanged draft and recorded ID.';
 }finally{$('record-draft').disabled=false;}
});
$('copy-draft').addEventListener('click',async()=>{
 try{await navigator.clipboard.writeText(preparedText);message.textContent='Draft copied. Not sent.';}
 catch{message.textContent='Clipboard unavailable. Copy the displayed draft manually.';}
});
// Editing the question or mission ID invalidates any in-flight and prior spoken snapshot.
let missionReadSequence=0;
function invalidateMissionVoiceReadback(){
  ++missionReadSequence;
  delete $('mission-summary').dataset.voiceReadback;
}
$('mission-id').addEventListener('input',invalidateMissionVoiceReadback);
$('voice-readonly-question').addEventListener('input',invalidateMissionVoiceReadback);
async function loadFounderMission(id,{quiet=false}={}){
 const out=$('mission-summary');
 const serial=++missionReadSequence;
 delete out.dataset.voiceReadback;
 if(!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{3,95}$/.test(id)){
  if(!quiet)out.textContent='Enter a valid existing mission ID.';return false;
 }
 if(!quiet)out.textContent='Reading saved departmental results…';
 try{
  const response=await fetch('/api/missions?missionId='+encodeURIComponent(id)+'&view=results',
   {credentials:'same-origin',cache:'no-store'});
  if(!response.ok)throw Error('MISSION_UNAVAILABLE');
  const record=(await response.json())?.data;
  if(serial!==missionReadSequence||$('mission-id').value.trim()!==id)return false;
  out.textContent=formatFounderMissionResults(record,id);
  try{out.dataset.voiceReadback=formatMissionSnapshotSpokenPreview(record.snapshot,id);}
  catch{delete out.dataset.voiceReadback;}
  const url=new URL(window.location.href);
  url.searchParams.set('missionId',id);
  window.history.replaceState(null,'',url);
  return true;
 }catch{
  if(serial===missionReadSequence){
   out.textContent='Saved mission results unavailable. No departmental completion inferred.';
  }
  return false;
 }
}
$('mission-form').addEventListener('submit',async event=>{
 event.preventDefault();
 await loadFounderMission($('mission-id').value.trim());
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
// Only refresh evidence for the currently selected mission while this tab is
// visible. Uses the existing founder-only GET; no new queue, writes or monitoring.
setInterval(()=>{
 if(document.visibilityState!=='visible')return;
 const id=$('mission-id').value.trim();
 if(!id||id!==new URL(window.location.href).searchParams.get('missionId'))return;
 void loadFounderMission(id,{quiet:true});
},60_000);
