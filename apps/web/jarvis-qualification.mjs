import {createG3QualificationView} from './g3-qualification-view.mjs';
const $=id=>document.getElementById(id);
const root=$('g3-intelligence-panel');
const status=$('g3-evidence-status');
const refresh=$('g3-refresh');
const metrics=$('g3-metrics'),domainRows=$('g3-domain-rows'),crossRows=$('g3-cross-rows'),priorities=$('g3-priorities');
const node=(tag,content,className)=>{
 const x=document.createElement(tag);
 if(content!==undefined)x.textContent=String(content);
 if(className)x.className=className;
 return x;
};
function metric(name,value,context){
 const card=node('article',undefined,'g3-metric');
 card.append(node('span',name,'g3-metric-name'),node('strong',value,'g3-metric-value'),node('small',context,'g3-metric-footnote'));
 return card;
}
function clear(){metrics?.replaceChildren();domainRows?.replaceChildren();crossRows?.replaceChildren();priorities?.replaceChildren();}
function show(model){
 clear();
 metrics.append(
  metric('Gateway receipts',model.gatewayReadCoverage===null?'Unverified':model.gatewayReadCoverage+'/4','Retrieval only · not source freshness'),
  metric('Structural candidates',model.candidates??'Unverified','Not qualified quantities'),
  metric('Held source contracts',model.held??'Unverified','Unresolved input contracts'),
  metric('Production forecast',model.forecast,'No certified forecasting or optimizer')
 );
 for(const row of model.sources){
  const tr=node('tr');
  const fields=[
   row.domain, row.read, row.receipt, row.structural,
   row.sampled===null?'Unknown':row.sampled,
   row.valid===null?'Unknown':row.valid,
   row.revisionHints===null?'Unknown':row.revisionHints,
   row.timeHints===null?'Unknown':row.timeHints,
   row.atLimit?'YES — POSSIBLY PARTIAL':'Unproven',
   row.completeProof
  ];
  for(let i=0;i<fields.length;i++){
   const td=node('td',fields[i]);
   if(i===3||i===9)td.className='g3-hold';
   tr.append(td);
  }
  domainRows.append(tr);
 }
 for(const check of model.checks){
  const li=node('li',undefined,'g3-check');
  const value=check.value===null?'Not evidenced':String(check.value);
  li.append(node('strong',value,'g3-check-value'),node('div',undefined,'g3-check-caption'));
  li.lastChild.append(node('b',check.label),node('small',check.note));
  crossRows.append(li);
 }
 for(const next of model.next)priorities.append(node('li',next));
 status.textContent='Read-only diagnostic refreshed at '+new Date().toLocaleString()+
  '. Source revisions, completeness, release, recovery and backtests are NOT certified.';
 status.dataset.state='hold';
}
async function load(){
 if(!root||!status||!refresh)return;
 refresh.disabled=true;
 status.dataset.state='loading';
 status.textContent='Checking four founder-authorized gateway reads and evidence controls…';
 try{
  const response=await fetch('/api/jarvis-g3-readiness',{credentials:'same-origin',cache:'no-store',headers:{'Accept':'application/json'}});
  if(!response.ok)throw Error(response.status===401?'Sign-in required':response.status===403?'Founder-only access denied':'Gateway unavailable or qualification disabled ('+response.status+')');
  const result=await response.json();
  show(createG3QualificationView(result));
 }catch(error){
  clear();
  status.dataset.state='unavailable';
  status.textContent='Evidence not available: '+error.message+'. No readiness result may be inferred.';
 }finally{refresh.disabled=false;}
}
refresh?.addEventListener('click',load);
if(root)load();
let coordinationBusy=false;
async function loadCoordination(){
 const state=$('g4-coordination-status'),reviews=$('g4-coordination-reviews');
 if(!state||!reviews||coordinationBusy)return;
 coordinationBusy=true;reviews.replaceChildren();
 state.textContent='Reading recorded workforce qualifications. No dispatch requested.';
 try{
  const response=await fetch('/api/jarvis-coordination',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
  if(!response.ok)throw Error();
  const {data}=await response.json();
  if(data?.schemaVersion!=='VAOS_JARVIS_COORDINATION_PROPOSAL_V1'||data.agentDispatchAuthorized!==false||!Array.isArray(data.reviews))throw Error();
  for(const row of data.reviews){
   reviews.append(node('li',row.domain+': '+row.owner.id+' with '+row.verifier.id+' as proposed verifier. '+
    (row.status==='REVIEW_PROPOSAL_ONLY'?'Recorded role floors met.':'Recorded qualification on hold.')+
    ' Heartbeat evidence: owner '+row.owner.heartbeatEvidence+', verifier '+row.verifier.heartbeatEvidence+'.'+
    ' Independent competence, source evidence, founder workflow approval and durable handoff remain required.'));
  }
  state.textContent='Recorded workforce evidence read at '+new Date(data.observedAt).toLocaleString()+'. Proposals only. No agents dispatched or qualifications awarded.';
  state.dataset.state='hold';
 }catch{
  reviews.replaceChildren();state.dataset.state='unavailable';
  state.textContent='Coordination evidence unavailable. Founder sign-in and a complete authoritative roster are required. No readiness inferred.';
 }finally{coordinationBusy=false;}
}
refresh?.addEventListener('click',loadCoordination);
if(root)loadCoordination();
