/** Founder-click-only, synthetic A06–A10 qualification board. */
const kinds=Object.freeze({
 A06:'Agent handoff recovery',
 A07:'Multimodal provenance and prompt injection',
 A08:'Counterfactual diagnostics',
 A09:'Canary regression and rollback recommendation',
 A10:'Federated evidence reconciliation'
});
const $=id=>document.getElementById(id);
const panel=$('a06-a10-panel'),auth=$('a06-a10-auth'),confirm=$('a06-a10-confirm'),
 run=$('a06-a10-run'),status=$('a06-a10-status'),results=$('a06-a10-results');
let running=false;
function render(data){
 results.replaceChildren();
 if(data?.schemaVersion!=='VAOS_JARVIS_A06_A10_OFFLINE_DRILL_V1'||
  data.syntheticOnly!==true||data.businessWritesExecuted!==0||
  data.providersInvoked!==0||data.productionRecoveryExecuted!==false||
  data.independentQualificationCertified!==false||
  !Array.isArray(data.stages)||data.stages.length!==5||
  data.stages.some((s,i)=>s?.stage!==Object.keys(kinds)[i]||s?.status!=='HOLD')){
  status.textContent='HOLD — verification response incomplete or untrusted. No qualification granted.';
  return;
 }
 for(const record of data.stages){
  const card=document.createElement('article');card.className='a610-card';
  const title=document.createElement('h3');
  title.textContent=record.stage+' · '+kinds[record.stage];
  const hold=document.createElement('strong');hold.textContent='INDEPENDENT ACCEPTANCE: HOLD';
  const note=document.createElement('p');
  const facts={
   A06:'Proposed human recovery reviews: '+String(record.retryReviewProposed??0)+
    '; dead-letter escalations: '+String(record.deadLetterEscalations??0),
   A07:'Media disposition: '+(record.disposition==='QUARANTINE'?'Quarantine':'Review only')+
    '; signed origin unverified',
   A08:'Historical difference-in-differences diagnostic: '+String(record.differenceInDifferences??'unavailable')+
    '; causal effect not certified',
   A09:'Canary health: '+(record.healthGate==='DEGRADED'?'Degraded':'Unverified')+
    '; no real rollback performed',
   A10:'Observed evidence stages: '+String(record.observedStages??0)+
    '/10; signed cross-system witness required'
  };
  note.textContent=facts[record.stage];
  card.append(title,hold,note);
  results.append(card);
 }
 status.textContent='Five synthetic engines executed. No provider/model calls, no production writes, no A06–A10 independent qualifications.';
}
confirm.addEventListener('change',()=>{run.disabled=running||!confirm.checked;});
run.addEventListener('click',async()=>{
 if(running||!confirm.checked)return;
 running=true;run.disabled=true;confirm.disabled=true;
 status.textContent='Running the bounded offline safety checks…';
 try{
  const response=await fetch('/api/jarvis-a06-a10-drill',{
   method:'POST',credentials:'same-origin',cache:'no-store',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({operation:'RUN_OFFLINE_SYNTHETIC_DRILL',confirm:true})
  });
  if(!response.ok)throw Error('UNAVAILABLE');
  render((await response.json()).data);
 }catch{
  results.replaceChildren();
  status.textContent='HOLD — offline drill unavailable. No production actions occurred or qualification can be claimed.';
 }finally{running=false;confirm.checked=false;confirm.disabled=false;run.disabled=true;}
});
(async()=>{
 try{
  const r=await fetch('/api/session',{credentials:'same-origin',cache:'no-store'});
  if(!r.ok)throw Error('SESSION_REQUIRED');
  panel.hidden=false;auth.hidden=true;
 }catch{
  panel.hidden=true;
  auth.textContent='A current VAOS founder session is required before any manual drill.';
 }
})();
