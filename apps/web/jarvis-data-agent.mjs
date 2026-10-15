import {chartSvg} from './lib/dashboard-charts.mjs';
import {buildInsightViews,resolveInsightChartKind,insightSummary} from './lib/insight-studio.mjs';
const $=id=>document.getElementById(id);
const form=$('data-agent-form');
if(form){
 const question=$('data-agent-question'),status=$('data-agent-status');
 const answer=$('data-agent-answer'),evidence=$('data-agent-sources');
 const graph=$('data-agent-chart'),selector=$('data-agent-chart-kind'),focus=$('data-agent-chart-focus');
 const investigation=$('data-agent-investigation');
 const findingStatus=$('data-agent-investigation-status');
 const findings=$('data-agent-investigation-findings');
 const brief=$('data-agent-founder-brief');
 const briefStage=$('data-agent-brief-stage');
 const briefPriority=$('data-agent-brief-priority');
 const briefHeading=$('data-agent-brief-heading');
 const briefExplanation=$('data-agent-brief-explanation');
 const briefAction=$('data-agent-brief-action');
 const briefSteps=$('data-agent-brief-steps');
 const technical=$('data-agent-technical');
 const people=$('data-agent-employees'),limitations=$('data-agent-limitations');
 const overview=$('data-agent-insight-summary'),chartNote=$('data-agent-chart-note');
 let latest=null,views=[];
 const add=(parent,value,tag='li')=>{
  const e=document.createElement(tag);e.textContent=value;parent.append(e);return e;
 };
 function render(){
  if(!latest)return;
  const view=views.find(x=>x.id===focus.value)||views[0];
  if(!view){
   graph.textContent='No observed numeric counts are available. Unknown is not zero.';
   chartNote.textContent='Source evidence unavailable for visual comparison.';
   return;
  }
  const chartKind=resolveInsightChartKind(view,selector.value);
  chartNote.textContent=view.note+(selector.value==='donut'&&!view.additive?
   ' Donut disabled for non-additive counts. Displaying bars instead.':'');
  graph.innerHTML=chartSvg(view.rows,chartKind,view.title);
 }
 function populateViews(data){
  views=buildInsightViews(data);focus.replaceChildren();
  for(const view of views){
   const option=document.createElement('option');option.value=view.id;
   option.textContent=view.label;focus.append(option);
  }
  if(!views.length){
   const option=document.createElement('option');option.value='none';
   option.textContent='No supported graphical observations';focus.append(option);
  }
  focus.value=views.some(v=>v.id==='investigation')?'investigation':views[0]?.id||'none';
  overview.replaceChildren();
  for(const [label,value] of insightSummary(data)){
   const item=document.createElement('div');item.className='data-agent-stat';
   add(item,label,'small');add(item,value,'strong');overview.append(item);
  }
  render();
 }
 selector.addEventListener('change',render);
 focus.addEventListener('change',render);
 document.querySelectorAll('[data-data-agent-question]').forEach(button=>{
  button.addEventListener('click',()=>{question.value=button.dataset.dataAgentQuestion||'';question.focus();});
 });
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  const q=question.value.trim();
  if(q.length<5||q.length>300){
   status.textContent='Enter a specific question (5–300 characters).';return;
  }
  status.textContent='Reading authorized sources…';latest=null;views=[];
  overview.replaceChildren();chartNote.textContent='Reading permitted source evidence…';
  answer.textContent='';evidence.replaceChildren();graph.replaceChildren();
  people.replaceChildren();limitations.replaceChildren();findings.replaceChildren();
  investigation.hidden=true;brief.hidden=true;briefSteps.replaceChildren();
  technical.open=true;focus.replaceChildren();
  const submit=form.querySelector('button[type=submit]');submit.disabled=true;
  try{
   const response=await fetch('/api/jarvis-data-agent?q='+encodeURIComponent(q),{
    method:'GET',credentials:'same-origin',cache:'no-store',
    headers:{Accept:'application/json'}});
   if(!response.ok)throw Error('HTTP_'+response.status);
   const x=(await response.json()).data;
   if(x?.schemaVersion!=='VAOS_DATA_AGENT_V1'||x.readOnly!==true||
    x.actionAuthorized!==false||!Array.isArray(x.sources)||!Array.isArray(x.metrics))
    throw Error('RESPONSE_UNVERIFIED');
   latest=x;
   status.textContent=x.status+' · '+x.sourceCoverage.observed+'/'+x.sourceCoverage.requested+
    ' connected source views · '+x.mode;
   answer.textContent=x.answer;
   for(const s of x.sources){
    add(evidence,'['+s.index+'] '+s.domain+' · '+s.status+
     (s.authority?' · '+s.authority:'')+
     (s.receiptAt?' · gateway receipt '+s.receiptAt:'')+
     ' · '+s.coverage);
   }
   for(const note of x.limitations||[])add(limitations,note);
   if(x.investigation?.schemaVersion==='VAOS_DATA_AGENT_INVESTIGATION_V1'){
    const result=x.investigation;investigation.hidden=false;
    if(result.decisionBrief?.headline&&result.operatingContext?.phase==='PRELAUNCH_CONFIGURATION'){
     brief.hidden=false;
     briefStage.textContent='PRELAUNCH PREPARATION · Record origin not verified';
     const labels={
      RECONCILE_SOURCE_CONFLICT:'First review · record discrepancy',
      COMPLETE_RELEASE_TRACE:'First review · release documentation',
      COMPLETE_RECORD_LINKS:'First review · missing relationships',
      CHECK_SOURCE_COVERAGE:'First review · incomplete source sample',
      RESTORE_SOURCE_OBSERVATIONS:'Source access required',
      NO_OBSERVED_DISCREPANCY:'No discrepancy in the selected sample'
     };
     briefPriority.textContent=labels[result.decisionBrief.priority]||'Preparation review';
     briefHeading.textContent=result.decisionBrief.headline;
     briefExplanation.textContent=result.decisionBrief.explanation;
     briefAction.textContent=result.decisionBrief.nextStep;
     for(const step of result.decisionBrief.preparationSteps||[])
      add(briefSteps,step);
     technical.open=false;
    }
    findingStatus.textContent=result.summary;
    if(!result.findings?.length){
     const p=document.createElement('p');
     p.textContent=result.status==='SOURCE_HOLD'
      ?'Missing or malformed sources prevent a supported diagnosis.'
      :'No linked discrepancy detected in this bounded observation window.';
     findings.append(p);
    }
    for(const f of result.findings||[]){
     const item=document.createElement('article');item.className='data-agent-finding';
     add(item,f.title,'h4');
     const priorityLabels={RECONCILE_SOURCE_CONFLICT:'Reconcile mismatch',
      COMPLETE_RELEASE_TRACE:'Document release history',
      COMPLETE_RECORD_LINKS:'Complete record links',
      CHECK_SOURCE_COVERAGE:'Check sampled coverage'};
     add(item,(priorityLabels[f.reviewPriority]||'Review')+' · '+
      f.observedCount+' selected row(s), not verified incidents','p');
     add(item,f.explanation,'p');
     add(item,'NEXT ACTION — '+f.action,'p');
     const sourceLabels=f.sourceDomains.map(domain=>{
      const source=x.sources.find(s=>s.domain===domain);
      return source?'['+source.index+'] '+domain:domain;
     });
     add(item,'SOURCE VIEWS — '+sourceLabels.join(' + '),'p');
     if(Array.isArray(f.evidenceTrail)&&f.evidenceTrail.length){
      const trail=document.createElement('details');trail.className='data-agent-evidence';
      add(trail,'Inspect matching sample positions ('+f.evidenceTrail.length+
       ' shown; no personal or commercial identifiers)','summary');
      const list=document.createElement('ol');
      for(const match of f.evidenceTrail){
       const refs=(match.rows||[]).map(ref=>{
        const source=x.sources.find(s=>s.domain===ref.domain);
        return '['+(source?.index||'?')+'] '+ref.domain+' '+ref.collection+
         ' sample row '+ref.position;
       });
       add(list,refs.join(' ↔ '));
      }
      trail.append(list);
      add(trail,'These positions refer only to this limited gateway response. They are not stable record IDs or links to complete VYNDI OS records.','p');
      item.append(trail);
     }
     findings.append(item);
    }
    if(result.holds?.length)add(findings,'Scope limits: '+result.holds.join('; '),'p');
   }
   if(Array.isArray(x.employees)){
    const heading=document.createElement('h3');heading.textContent='Individual digital employee records';
    people.append(heading);
    const table=document.createElement('table'),head=document.createElement('thead');
    const tr=document.createElement('tr');
    for(const h of ['Employee','Record','Lifecycle','Tasks','Completed','Blocked'])
     add(tr,h,'th');
    head.append(tr);table.append(head);
    const tbody=document.createElement('tbody');
    for(const employee of x.employees){
     const row=document.createElement('tr');
     for(const value of [employee.name,employee.sourceStatus,employee.lifecycle,
       employee.workTotal,employee.completed,employee.blocked])
      add(row,value===null||value===undefined?'Unknown':String(value),'td');
     tbody.append(row);
    }
    table.append(tbody);people.append(table);
   }
   populateViews(x);
  }catch{
   latest=null;views=[];overview.replaceChildren();graph.replaceChildren();
   chartNote.textContent='No qualified analytical view is available.';
   status.textContent='Qualified data-agent response unavailable. No data inferred or modified.';
  }finally{submit.disabled=false;}
 });
}
