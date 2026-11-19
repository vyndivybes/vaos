/** Founder-only A03 manual signed-read trial. No automatic execution. */
const KINDS=Object.freeze(['inventory','shortages','purchaseOrders']);
const HOLD=Object.freeze({
 status:'HOLD',qualificationStatus:'HOLD',businessWriteCount:0,
 businessSourceAuthorityVerified:false,sources:Object.freeze([]),
 headline:'Source trial not verified',
 explanation:'No production signed-read outcome can be claimed from this response. Retry after checking your founder session and existing source controls.'
});
const safeInt=v=>Number.isSafeInteger(v)&&v>=0&&v<=100;
export function summarizeA03Canary(data){
 if(!data||typeof data!=='object'||Array.isArray(data)||
  data.schemaVersion!=='VAOS_JARVIS_A03_SIGNED_READ_CANARY_V1'||
  !['BOUNDED_READ_COMPLETE','HOLD'].includes(data.status)||
  data.qualificationStatus!=='HOLD'||
  data.productionWriteAuthorized!==false||
  data.agentDispatchAuthorized!==false||
  data.actionAuthorized!==false||
  data.businessWritesExecuted!==0||
  data.independentBusinessFactsCertified!==false||
  data.sourceCompletenessVerified!==false||
  !Number.isSafeInteger(data.externalReadInvocations)||
  data.externalReadInvocations<0||data.externalReadInvocations>3||
  !Array.isArray(data.sources)||data.sources.length!==3)
  return HOLD;
 const sources=[];
 for(let i=0;i<KINDS.length;i++){
  const row=data.sources[i];
  if(!row||row.sourceKind!==KINDS[i]||
   !['SIGNED_BOUNDED_OBSERVATION','HOLD','NOT_ATTEMPTED'].includes(row.status)||
   row.authoritativeRevisionVerified===true||
   row.sourceCompletenessVerified===true||
   row.productionWriteAuthorized===true||
   (row.status==='SIGNED_BOUNDED_OBSERVATION'&&!safeInt(row.sourceCount))||
   (row.status!=='SIGNED_BOUNDED_OBSERVATION'&&row.sourceCount!==null)){
   return HOLD;
  }
  sources.push(Object.freeze({
   sourceKind:KINDS[i],status:row.status,
   sourceCount:row.status==='SIGNED_BOUNDED_OBSERVATION'?row.sourceCount:null
  }));
 }
 if(data.status==='BOUNDED_READ_COMPLETE'&&
  (data.externalReadInvocations!==3||sources.some(x=>x.status!=='SIGNED_BOUNDED_OBSERVATION')))
   return HOLD;
 if(data.status==='HOLD'&&sources.every(x=>x.status==='SIGNED_BOUNDED_OBSERVATION'))
  return HOLD;
 return Object.freeze({
  status:data.status,
  qualificationStatus:'HOLD',
  businessWriteCount:0,businessSourceAuthorityVerified:false,
  sources:Object.freeze(sources),
  headline:data.status==='BOUNDED_READ_COMPLETE'?'Three bounded signed reads completed':'Signed source trial held',
  explanation:data.status==='BOUNDED_READ_COMPLETE'
   ?'The existing source bridge returned bounded observations. This does not certify database revisions, complete enterprise records, approvals or business authority.'
   :'At least one source observation was unavailable or rejected. No business action or source certification has been authorized.'
 });
}
/** The only source-running request. Called exclusively from a confirmed click. */
export async function runA03CanaryFromFounderClick({confirmed,fetcher=fetch}={}){
 if(confirmed!==true)throw Error('A03_FOUNDER_CONFIRMATION_REQUIRED');
 try{
  const response=await fetcher('/api/jarvis-a03-read-canary',{
   method:'POST',credentials:'same-origin',cache:'no-store',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({operation:'VERIFY_SIGNED_SOURCE_READS',confirm:true})
  });
  if(!response?.ok)return HOLD;
  const body=await response.json();
  return summarizeA03Canary(body?.data);
 }catch{return HOLD;}
}
/**
 * Separate founder consent: perform a NEW signed read on the server, store only
 * metadata in R2, then GET the stored object to confirm integrity. Never treats
 * the prior on-screen counts, local data, or screenshots as stored provenance.
 */
const INVALID_ARCHIVE=Object.freeze({status:'HOLD',qualificationStatus:'HOLD',
 receipt:null,integrityVerified:false,independentSignatureVerified:false,
 sourceCounts:Object.freeze([])});
const RECEIPT=/^\d{4}-\d{2}-\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function captureA03DurableEvidence({confirmed,fetcher=fetch}={}){
 if(confirmed!==true)throw Error('A03_ARCHIVE_CONFIRMATION_REQUIRED');
 try{
  const response=await fetcher('/api/jarvis-a03-evidence',{
   method:'POST',credentials:'same-origin',cache:'no-store',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({operation:'CAPTURE_FRESH_SIGNED_READ',confirm:true})
  });
  if(!response?.ok)return INVALID_ARCHIVE;
  const created=(await response.json())?.data;
  if(created?.stored!==true||created.status!=='HOLD'||
    created.actionAuthorized!==false||created.productionWriteAuthorized!==false||
    created.businessSourceAuthorityVerified!==false||
    typeof created.receipt!=='string'||!RECEIPT.test(created.receipt))
   return INVALID_ARCHIVE;
  const raw=await fetcher('/api/jarvis-a03-evidence?receipt='+encodeURIComponent(created.receipt),{
   method:'GET',credentials:'same-origin',cache:'no-store'
  });
  if(!raw?.ok)return INVALID_ARCHIVE;
  const proof=(await raw.json())?.data;
  if(proof?.receipt!==created.receipt||
   proof.integrityVerified!==true||proof.independentSignatureVerified!==false||
   proof.actionAuthorized!==false||proof.productionWriteAuthorized!==false||
   proof.businessSourceAuthorityVerified!==false||
   proof.evidence?.schemaVersion!=='VAOS_JARVIS_A03_ARCHIVED_OBSERVATION_V1'||
   proof.evidence?.qualificationStatus!=='HOLD'||
   proof.evidence?.status!=='BOUNDED_READ_COMPLETE'||
   created.boundedReadCompleted!==true||
   !Array.isArray(proof.evidence.sources)||proof.evidence.sources.length!==3)
   return INVALID_ARCHIVE;
  const sourceCounts=[];
  for(let i=0;i<KINDS.length;i++){
   const s=proof.evidence.sources[i];
   if(s?.sourceKind!==KINDS[i]||s?.status!=='SIGNED_BOUNDED_OBSERVATION'||
    !safeInt(s?.sourceCount)||s.independentlyCertified!==false||
    s.sourceCompletenessVerified!==false)
    return INVALID_ARCHIVE;
   sourceCounts.push(s.sourceCount);
  }
  return Object.freeze({
   status:'ARCHIVED_BOUNDED_OBSERVATION',qualificationStatus:'HOLD',
   receipt:created.receipt,integrityVerified:true,
   independentSignatureVerified:false,sourceCounts:Object.freeze(sourceCounts)
  });
 }catch{return INVALID_ARCHIVE;}
}

if(typeof document!=='undefined'){
 const $=id=>document.getElementById(id);
 const pane=$('a03-panel'),confirm=$('a03-confirm'),runButton=$('a03-run'),
  status=$('a03-status'),sourceList=$('a03-sources'),
  qualification=$('a03-qualification'),auth=$('a03-auth');
 const archivePanel=$('a03-archive-panel'),archiveConfirm=$('a03-archive-confirm'),
  captureButton=$('a03-capture'),archiveStatus=$('a03-archive-status');
 let running=false;
 function render(data){
  status.textContent=data.headline+' — '+data.explanation;
  status.dataset.state=data.status;
  qualification.textContent='A01 source authority: HOLD · A03 independent qualification: HOLD · Business writes: 0';
  sourceList.replaceChildren();
  const names={inventory:'Inventory balance',shortages:'Demand shortages',purchaseOrders:'Open-scope purchase orders'};
  for(const row of data.sources){
   const li=document.createElement('li');
   const title=document.createElement('strong');
   title.textContent=names[row.sourceKind];
   const detail=document.createElement('span');
   detail.textContent=row.status==='SIGNED_BOUNDED_OBSERVATION'
    ?'Bounded observation · '+row.sourceCount+' scoped rows · not source-certified'
    :row.status==='NOT_ATTEMPTED'?'Not attempted':'HOLD — signed observation unverified';
   li.append(title,detail);
   sourceList.append(li);
  }
 }
 confirm.addEventListener('change',()=>{
  runButton.disabled=running||confirm.checked!==true;
 });
 runButton.addEventListener('click',async()=>{
  if(running||confirm.checked!==true)return;
  running=true;runButton.disabled=true;confirm.disabled=true;
  status.textContent='Checking the three approved read-only sources…';
  sourceList.replaceChildren();qualification.textContent='Awaiting bounded receipt checks. Source certification remains HOLD.';
  const data=await runA03CanaryFromFounderClick({confirmed:true});
  render(data);
  confirm.checked=false;confirm.disabled=false;running=false;runButton.disabled=true;
 });
 archiveConfirm.addEventListener('change',()=>{
  captureButton.disabled=running||archiveConfirm.checked!==true;
 });
 captureButton.addEventListener('click',async()=>{
  if(running||archiveConfirm.checked!==true)return;
  running=true;captureButton.disabled=true;archiveConfirm.disabled=true;
  archiveStatus.textContent='Requesting a fresh bounded signed read and integrity-checked archive…';
  const x=await captureA03DurableEvidence({confirmed:true});
  archiveStatus.textContent=x.status==='ARCHIVED_BOUNDED_OBSERVATION'
   ?'Metadata-only receipt stored and independently replay-checked: '+x.receipt+
      ' · scoped counts: '+x.sourceCounts.join(' / ')+
      '. Integrity verified; independent signature and business authority remain HOLD.'
   :'Audit archive unavailable or unverified. No persisted evidence can be claimed. Storage must remain disabled until free-tier headroom is approved.';
  archiveConfirm.checked=false;archiveConfirm.disabled=false;
  running=false;captureButton.disabled=true;
 });
 async function authenticate(){
  try{
   const response=await fetch('/api/session',{credentials:'same-origin',cache:'no-store'});
   if(!response.ok)throw Error('SESSION_NOT_AUTHENTICATED');
   pane.hidden=false;archivePanel.hidden=false;auth.hidden=true;
  }catch{
   pane.hidden=true;archivePanel.hidden=true;
   auth.textContent='A current VAOS session is required. Sign in, then return to start your manual read-only trial.';
  }
 }
 authenticate();
}
