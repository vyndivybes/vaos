import {chartSvg} from './lib/dashboard-charts.mjs';
const $=id=>document.getElementById(id);
const form=$('data-agent-form');
if(form){
 const question=$('data-agent-question'),status=$('data-agent-status');
 const answer=$('data-agent-answer'),evidence=$('data-agent-sources');
 const graph=$('data-agent-chart'),selector=$('data-agent-chart-kind');
 const people=$('data-agent-employees'),limitations=$('data-agent-limitations');
 let latest=null;
 const add=(parent,value,tag='li')=>{
  const e=document.createElement(tag);e.textContent=value;parent.append(e);return e;
 };
 function render(){
  if(!latest)return;
  graph.innerHTML=chartSvg(latest.chart?.rows||[],selector.value,
   latest.chart?.title||'Observed source counts');
 }
 selector.addEventListener('change',render);
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  const q=question.value.trim();
  if(q.length<5||q.length>300){
   status.textContent='Enter a specific question (5–300 characters).';return;
  }
  status.textContent='Reading authorized sources…';latest=null;
  answer.textContent='';evidence.replaceChildren();graph.replaceChildren();
  people.replaceChildren();limitations.replaceChildren();
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
