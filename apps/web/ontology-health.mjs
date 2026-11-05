// Ponytail: one read-only request; future object UI waits for independently verified sources.
const status=document.querySelector('#ontology-health-status');
const list=document.querySelector('#ontology-health-sources');
const refresh=document.querySelector('#ontology-health-refresh');
async function update(){
 status.textContent='Checking signed source receipts…';
 refresh.disabled=true;
 try{
  const response=await fetch('/api/ontology/health',{credentials:'same-origin',cache:'no-store'});
  if(!response.ok)throw Error('HEALTH_NOT_AVAILABLE');
  const payload=await response.json();
  const data=payload?.data;
  if(data?.status!=='HOLD'||data?.agentUsable!==false||
     !Array.isArray(data.sources)||data.sources.length!==3)throw Error('HEALTH_INVALID');
  for(const item of data.sources){
   const row=[...list.children].find(e=>e.dataset.ontologyKind===item.sourceKind);
   if(!row)throw Error('SOURCE_NOT_REGISTERED');
   const detail=row.querySelector('small');
   const count=item.observedCount===null?'No signed receipt':
     item.observedCount+' extracted rows (not independently verified)';
   const time=item.lastExtractedAt?' · extracted '+item.lastExtractedAt:'';
   detail.textContent=item.status+' — '+item.reason+' · '+count+time;
  }
  status.textContent='Governance HOLD: observations are not independently verified and cannot authorize actions.';
 }catch{
  for(const row of list.children)row.querySelector('small').textContent='HOLD — Evidence unavailable';
  status.textContent='HOLD — Ontology source evidence unavailable; no business values inferred.';
 }finally{refresh.disabled=false;}
}
refresh.addEventListener('click',update);
update();
