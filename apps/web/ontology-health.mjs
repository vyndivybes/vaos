// Ponytail: manual founder-only canaries reuse the existing signed read and guarded receipt API.
const status=document.querySelector('#ontology-health-status');
const list=document.querySelector('#ontology-health-sources');
const refresh=document.querySelector('#ontology-health-refresh');
const captureStatus=document.querySelector('#ontology-capture-status');
const captureButtons=[...list.querySelectorAll('[data-ontology-canary]')];
let healthVerified=false,capturing=false;
function syncButtons(){
 for(const button of captureButtons)button.disabled=!healthVerified||capturing;
}
async function update(){
 healthVerified=false;syncButtons();
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
  healthVerified=true;
  status.textContent='Governance HOLD: observations are not independently verified and cannot authorize actions.';
 }catch{
  for(const row of list.children)row.querySelector('small').textContent='HOLD — Evidence unavailable';
  status.textContent='HOLD — Ontology source evidence unavailable; no business values inferred.';
 }finally{refresh.disabled=false;syncButtons();}
}
for(const button of captureButtons)button.addEventListener('click',async()=>{
 if(!healthVerified||capturing)return;
 capturing=true;syncButtons();
 captureStatus.textContent='Checking signed source and storing a bounded read-only receipt…';
 try{
  const response=await fetch('/api/ontology/ingest-canary?source='+encodeURIComponent(button.dataset.ontologyCanary),{
   method:'POST',credentials:'same-origin',cache:'no-store',
  });
  const payload=await response.json();
  const result=payload?.data;
  if(!response.ok||result?.status!=='SOURCE_UNVERIFIED'||
     result?.durableReceiptStored!==true||result?.sourceCompletenessVerified!==false||
     result?.agentUsable!==false||result?.actionAuthorized!==false||
     result?.productionWriteAuthorized!==false)throw Error('RECEIPT_NOT_CONFIRMED');
  captureStatus.textContent='SOURCE_UNVERIFIED receipt stored. No business action authorized.';
  await update();
 }catch{
  captureStatus.textContent='HOLD — source or durable receipt not qualified. No business action authorized.';
 }finally{capturing=false;syncButtons();}
});
refresh.addEventListener('click',update);
update();
