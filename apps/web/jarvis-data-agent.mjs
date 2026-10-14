import {chartSvg} from './lib/dashboard-charts.mjs';
const $=id=>document.getElementById(id);
const form=$('data-agent-form');
if(form){
 const question=$('data-agent-question'),status=$('data-agent-status');
 const answer=$('data-agent-answer'),evidence=$('data-agent-sources');
 const graph=$('data-agent-chart'),selector=$('data-agent-chart-kind'),focus=$('data-agent-chart-focus');
 const investigation=$('data-agent-investigation');
 const findingStatus=$('data-agent-investigation-status');
 const findings=$('data-agent-investigation-findings');
 const people=$('data-agent-employees'),limitations=$('data-agent-limitations');
 let latest=null;
 const add=(parent,value,tag='li')=>{
  const e=document.createElement(tag);e.textContent=value;parent.append(e);return e;
 };
 function render(){
  if(!latest)return;
  const selected=focus.value==='investigation'&&latest.investigation?
   latest.investigation.chart:latest.chart;
  graph.innerHTML=chartSvg(selected?.rows||[],selector.value,
   selected?.title||'Observed source counts');
 }
 selector.addEventListener('change',render);
 focus.addEventListener('change',render);
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  const q=question.value.trim();
  if(q.length<5||q.length>300){
   status.textContent='Enter a specific question (5–300 characters).';return;
  }
  status.textContent='Reading authorized sources…';latest=null;
  answer.textContent='';evidence.replaceChildren();graph.replaceChildren();
  people.replaceChildren();limitations.replaceChildren();findings.replaceChildren();
  investigation.hidden=true;focus.value='sources';
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
    findingStatus.textContent=result.summary;
    focus.value='investigation';
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
     add(item,f.observedCount+' selected row(s) · '+f.classification+' · '+f.severity,'p');
     add(item,f.explanation,'p');
     add(item,'NEXT ACTION — '+f.action,'p');
     const sourceLabels=f.sourceDomains.map(domain=>{
      const source=x.sources.find(s=>s.domain===domain);
      return source?'['+source.index+'] '+domain:domain;
     });
     add(item,'EVIDENCE — '+sourceLabels.join(' + '),'p');
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
   render();
  }catch{
   status.textContent='Qualified data-agent response unavailable. No data inferred or modified.';
  }finally{submit.disabled=false;}
 });
}
