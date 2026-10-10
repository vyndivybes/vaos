import {AGENTS,prepareFounderCommand,safeAgentSnapshot} from './founder-command.mjs';
const $=id=>document.getElementById(id),shell=$('founder-shell'),message=$('command-message'),agentSelect=$('agent');
let preparedText='';
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
agentSelect.addEventListener('change',()=>{$('draft-panel').hidden=true;preparedText='';refresh();});
$('refresh').addEventListener('click',refresh);
$('command-form').addEventListener('submit',event=>{
 event.preventDefault();
 try{
  const d=prepareFounderCommand({agentId:agentSelect.value,kind:$('command-kind').value,instruction:$('instruction').value});
  const a=AGENTS.find(a=>a.id===d.recipientAgentId);
  preparedText='Recipient: '+a.name+' ('+d.recipientAgentId+')\nType: '+d.kind+'\nStatus: DRAFT_NOT_SENT\n\n'+d.instruction+'\n\nRequires governed submission. No authority granted.';
  $('draft-output').textContent=preparedText;$('draft-panel').hidden=false;
  message.textContent='Draft prepared locally. It has NOT been sent to an agent.';
 }catch{message.textContent='Invalid draft. Enter a specific instruction (5–2000 characters).';}
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
authenticate();
