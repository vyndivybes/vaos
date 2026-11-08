/** Read-only, source-bound departmental evidence view for the VAOS executive cockpit.
 * The derived counts describe response coverage, NOT performance, revenue, profitability,
 * evidence completeness or independent source verification.
 */
const CONTRACT='VYNDI_ENTERPRISE_BI_V1';
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const ID=/^[a-z0-9][a-z0-9_.-]{0,79}$/i;
const TEXT=/[\x00-\x1f\x7f]/;
const ATTENTION=new Set(['HOLD','UNAVAILABLE','NOT_COMMISSIONED','SOURCE_UNVERIFIED','ERROR','BLOCKED']);
const PARTIAL=new Set(['PARTIAL','INCOMPLETE','STALE','DEGRADED']);
const LINKED=Object.freeze({
 finance:'/workspace?view=finance',commercial:'/workspace?view=crm',crm:'/workspace?view=crm',
 people:'/workspace?view=hr',procurement:'/workspace?view=supply-chain',
 inventory:'/workspace?view=supply-chain',production:'/workspace?view=manufacturing',
 quality:'/workspace?view=qa-capa',qa:'/workspace?view=qa-capa',
 risk:'/workspace?view=risk',security:'/workspace?view=governance',
 project:'/workspace?view=projects',knowledge:'/neural-knowledge.html',
 'engineering-configuration':'/workspace?view=engineering',
 orchestrator:'/founder-console.html',
});
function error(code){throw new Error('EVIDENCE_'+code)}
function validDate(value){
 if(typeof value!=='string'||!DATE.test(value))return false;
 const date=new Date(value+'T00:00:00Z');
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
function label(value,max=140){
 return typeof value==='string'&&value.trim()&&value.length<=max&&!TEXT.test(value)?value.trim():null;
}
function classify(status){
 if(status==='OBSERVED')return 'observed';
 if(ATTENTION.has(status))return 'attention';
 if(PARTIAL.has(status))return 'partial';
 return 'other';
}
function priority(row){
 return row.category==='attention'?0:row.category==='partial'?1:row.category==='other'?2:3;
}
function nextStep(category){
 if(category==='attention')return 'Investigate this department’s signed source availability';
 if(category==='partial')return 'Review source coverage, missingness and reporting period';
 if(category==='other')return 'Check the source status contract before interpreting this record';
 return 'Inspect underlying records, completeness and source authority';
}
export function resolveEvidencePeriod(today,days=30){
 if(!validDate(today)||!Number.isInteger(days)||days<1||days>366)error('PERIOD_INVALID');
 const end=Date.parse(today+'T00:00:00Z');
 const start=new Date(end-(days-1)*86_400_000).toISOString().slice(0,10);
 return {from:start,to:today};
}
export function deriveEvidenceView(packet,{from,to}={}){
 if(!validDate(from)||!validDate(to)||from>to||!packet||typeof packet!=='object'||
  packet.schemaVersion!==CONTRACT||packet.readOnly!==true||packet.scope!=='all'||
  packet.period?.from!==from||packet.period?.to!==to||
  !Array.isArray(packet.departments)||packet.departments.length>100)error('SOURCE_CONTRACT_INVALID');
 if(packet.executiveSignals!==undefined&&
  (packet.executiveSignals?.schemaVersion!=='VYNDI_EXECUTIVE_SIGNALS_V1'||
   packet.executiveSignals?.readOnly!==true))error('EXECUTIVE_SIGNALS_INVALID');
 const known=new Set();
 const rows=packet.departments.map((raw,index)=>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))error('DEPARTMENT_INVALID');
  const id=raw.employeeId||raw.departmentId||raw.department||raw.id;
  if(typeof id!=='string'||!ID.test(id)||known.has(id))error('DEPARTMENT_ID_INVALID');
  known.add(id);
  const status=label(raw.status,60)?.toUpperCase()||'UNKNOWN';
  const coverageStatus=label(raw.coverage?.status,60)?.toUpperCase()||null;
  const category=status==='OBSERVED'&&coverageStatus==='PARTIAL_OR_UNAVAILABLE'?'partial':classify(status);
  const observedAt=label(raw.observedAt||raw.asOf||raw.sourceObservedAt,50);
  return Object.freeze({
   id,name:label(raw.department||raw.displayName||raw.label,100)||id.replaceAll('-',' ').replaceAll('_',' '),
   status,category,coverageStatus,sourceObserved:status==='OBSERVED',
   observedRelatedSources:Number.isSafeInteger(raw.coverage?.observed)?raw.coverage.observed:null,
   expectedRelatedSources:Number.isSafeInteger(raw.coverage?.expected)?raw.coverage.expected:null,
   periodEventCount:status==='OBSERVED'&&Number.isSafeInteger(raw.periodEventCount)?raw.periodEventCount:null,
   currentAttentionCount:status==='OBSERVED'&&Number.isSafeInteger(raw.currentAttentionCount)?raw.currentAttentionCount:null,
   businessActualsQualified:false,actionAuthorized:false,
   sourceRef:label(raw.sourceRef||raw.sourceTable,150),
   observedAt:observedAt&&Number.isFinite(Date.parse(observedAt))?new Date(observedAt).toISOString():null,
   sourceRevision:label(raw.sourceRevision,100),
   reason:label(raw.reason||raw.diagnosticCode,220),
   nextStep:nextStep(category),href:LINKED[id]||'/workspace',
   originalIndex:index,
  });
 });
 rows.sort((a,b)=>priority(a)-priority(b)||a.name.localeCompare(b.name));
 const counts={observed:0,attention:0,partial:0,other:0};
 for(const row of rows)counts[row.category]++;
 return Object.freeze({schemaVersion:'VAOS_EXECUTIVE_EVIDENCE_VIEW_V1',period:{from,to},
  total:rows.length,counts,rows,status:rows.length?'READ_SUCCEEDED_SOURCE_UNVERIFIED':'NO_DEPARTMENT_EVIDENCE',
  businessTruthCertified:false,sourceCompletenessVerified:false,actionAuthorized:false,readOnly:true});
}
export function filterEvidenceRows(rows,{state='all',query=''}={}){
 if(!Array.isArray(rows))error('ROWS_INVALID');
 if(!['all','observed','attention','partial','other'].includes(state))error('FILTER_INVALID');
 const q=typeof query==='string'?query.trim().toLowerCase().slice(0,90):'';
 return rows.filter(r=>(state==='all'||r.category===state)&&
  (!q||[r.id,r.name,r.status,r.sourceRef].some(v=>String(v||'').toLowerCase().includes(q))));
}
