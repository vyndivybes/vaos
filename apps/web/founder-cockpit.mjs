import {cockpitSources,employeeHref,erpDestination,workforceChart} from './lib/founder-cockpit.mjs';
import {chartSvg} from './lib/dashboard-charts.mjs';

const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
export function initializeFounderCockpit(model){
 const root=document.querySelector('#founder-cockpit');
 if(!root)return;
 let sources=null,analytics=null,search='',filter='all',busy=false;
 const employees=()=>analytics?.employees||model.workforce?.digitalEmployees||[];
 const sourceStatus=document.querySelector('#cockpit-source-status');
 const workforceStatus=document.querySelector('#cockpit-workforce-status');
 const button=document.querySelector('#cockpit-refresh');
 function render(){
  const domains=cockpitSources(sources);
  document.querySelector('#cockpit-domains').innerHTML=domains.map((d,i)=>`<article class="fc-domain">
   <div class="fc-domain-top"><span class="fc-index">${String(i+1).padStart(2,'0')}</span><span class="fc-status ${d.observed?'fc-status--connected':''}">${esc(d.status)}</span></div>
   <h3>${esc(d.label)}</h3><p>${esc(d.note)}</p>
   <div class="fc-domain-actions">${d.view?`<button type="button" data-view="${esc(d.view)}">Review records →</button>`:''}<a href="${erpDestination(d)}" target="_blank" rel="noopener noreferrer">Open ${d.id==='inventory'?'inventory':'source'} ↗</a>${d.id==='engineering'?'<a href="/engineering-viewer.html">VEDM evidence ↗</a>':''}</div></article>`).join('');
  document.querySelector('#cockpit-source-count').textContent=sources?domains.filter(d=>d.observed).length+'/8':'—';
  document.querySelector('#cockpit-employee-count').textContent=employees().length||'—';
  document.querySelector('#cockpit-decision-count').textContent=model.approvals.length;
  document.querySelector('#cockpit-source-chart').innerHTML=sources?chartSvg([
   {label:'Connected',value:domains.filter(d=>d.observed).length},
   {label:'Setup / verify',value:domains.filter(d=>!d.observed).length},
  ],'bars','Signed ERP source reachability'):'<p class="empty-state">Source coverage not yet checked.</p>';
  const roster=employees().filter(e=>!search||[e.name,e.department,e.role,e.lifecycle,e.lifecycleStatus].join(' ').toLowerCase().includes(search))
   .filter(e=>filter==='all'||(e.lifecycle||e.lifecycleStatus||'Unverified')===filter);
  document.querySelector('#cockpit-roster').innerHTML=roster.length?roster.map(e=>`<a class="fc-employee" href="${employeeHref(e.id)}">
   <span class="fc-avatar" aria-hidden="true">${esc((e.name||e.id).slice(0,2).toUpperCase())}</span>
   <span><strong>${esc(e.name||e.id)}</strong><small>${esc(e.department||e.role||'Department unassigned')}</small></span>
   <span class="fc-employee-state">${esc(e.lifecycle||e.lifecycleStatus||'Unverified')}<small>${analytics?'Audit: '+esc(e.audit?.status||'Not evidenced'):'Registry only'}</small></span><span aria-hidden="true">↗</span></a>`).join(''):'<p class="empty-state">No matching employees in the available source.</p>';
  document.querySelector('#cockpit-roster-count').textContent=roster.length+' of '+employees().length+' shown';
  document.querySelector('#cockpit-workforce-chart').innerHTML=chartSvg(workforceChart(employees()),'bars','Recorded employee lifecycle states');
 }
 async function read(path){
  const response=await fetch(path,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error(response.status===403?'Founder access required':response.status===401?'Sign in required':'Source unavailable');
  const payload=await response.json();
  if(!payload.data)throw new Error('Source response unavailable');
  return payload.data;
 }
 async function refresh(){
  if(busy)return;
  busy=true;button.disabled=true;button.textContent='Checking sources…';
  sourceStatus.textContent='Checking signed source reads…';workforceStatus.textContent='Checking workforce evidence…';
  // Independent protected reads. Failure in either never hides the working cockpit.
  await Promise.allSettled([
   read('/api/group-portfolio').then(data=>{
    sources=data;
    sourceStatus.textContent='Source observation: '+(data.generatedAt?new Date(data.generatedAt).toLocaleString():'time unavailable')+'. Connectivity is not operational performance.';
   }).catch(error=>{sources=null;sourceStatus.textContent=error.message+'. Open the source workspace to complete setup.';}),
   read('/api/workforce-analytics').then(data=>{
    if(data.schemaVersion!=='VAOS_FOUNDER_ANALYTICS_V1'||data.actionAuthorized!==false||!Array.isArray(data.employees)||data.employees.length!==16)throw new Error('Workforce evidence unavailable');
    analytics=data;workforceStatus.textContent='Protected workforce evidence loaded. Lifecycle and audit status do not establish runtime liveness.';
   }).catch(error=>{analytics=null;workforceStatus.textContent=error.message+'. Showing the authenticated registry only; work and audit metrics are unavailable.';}),
  ]);
  const select=document.querySelector('#cockpit-lifecycle');
  const options=[...new Set(employees().map(e=>e.lifecycle||e.lifecycleStatus||'Unverified'))];
  if(!options.includes(filter))filter='all';
  select.innerHTML='<option value="all">All lifecycle states</option>'+options.map(x=>`<option value="${esc(x)}" ${x===filter?'selected':''}>${esc(x)}</option>`).join('');
  render();busy=false;button.disabled=false;button.textContent='Refresh sources';
 }
 document.querySelector('#cockpit-employee-search').addEventListener('input',event=>{search=event.target.value.trim().toLowerCase();render();});
 document.querySelector('#cockpit-lifecycle').addEventListener('change',event=>{filter=event.target.value;render();});
 button.addEventListener('click',refresh);
 document.querySelectorAll('[data-jarvis-question]').forEach(b=>b.addEventListener('click',()=>{
  const input=document.querySelector('#vaos-voice-question');input.value=b.dataset.jarvisQuestion;input.focus();
 }));
 render();void refresh();
 return {update(next){model=next;render();}};
}
