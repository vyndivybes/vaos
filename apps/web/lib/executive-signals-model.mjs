/** Seven independently scoped VYNDI CRM/HR/dispatch canonical aggregates.
 * No mixing record populations, no inference about revenue, employee performance,
 * order demand, carrier delivery, payroll eligibility or forecasts.
 */
export const SIGNAL_FAMILIES=Object.freeze([
 Object.freeze({id:'crmCustomers',label:'CRM customers',context:'Customer segment and lifecycle',href:'/workspace?view=crm'}),
 Object.freeze({id:'crmFollowups',label:'CRM follow-ups',context:'Recorded follow-up activity states',href:'/workspace?view=crm'}),
 Object.freeze({id:'crmOrderLinks',label:'CRM-linked orders',context:'Distinct linked sales orders by segment and status',href:'/workspace?view=crm'}),
 Object.freeze({id:'hrWorkforce',label:'Workforce registry',context:'People records by engagement and lifecycle',href:'/workspace?view=hr'}),
 Object.freeze({id:'hrAttendance',label:'Current attendance',context:'Current attendance status register',href:'/workspace?view=hr'}),
 Object.freeze({id:'hrPayrollReadiness',label:'Payroll readiness',context:'Recorded payroll readiness by period',href:'/workspace?view=hr'}),
 Object.freeze({id:'dispatch',label:'Dispatch register',context:'Distinct shipment states and invoice issue status',href:'/workspace?view=supply-chain'}),
]);
const VALID=/^[^\x00-\x1f\x7f]{1,120}$/;
const validText=x=>typeof x==='string'&&VALID.test(x)&&x.trim()?x.trim():null;
const validInt=x=>Number.isSafeInteger(x)&&x>=0;
function problem(code){throw new Error('EXECUTIVE_SIGNALS_'+code);}
function date(x){return typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&
 Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;}
function isAttention(id,status){
 const s=status.trim().toLowerCase();
 return ['overdue','blocked','hold','failed','rejected','unavailable','not_ready','not ready'].includes(s)||
  (id==='dispatch'&&/invoice\s+none$/.test(s));
}
function pending(id,n){
 if(n===null)return 'Restore and review this canonical aggregate source';
 if(n>0&&id==='crmFollowups')return 'Inspect overdue or blocked CRM follow-up records';
 if(n>0&&id==='dispatch')return 'Review shipments that lack an issued invoice; delivery remains unverified';
 if(n>0&&id==='hrPayrollReadiness')return 'Inspect readiness exception states for the applicable payroll period';
 if(n>0)return 'Inspect records with reported blocked, failed or overdue states';
 return 'Inspect original status breakdowns; no future outcome is inferred';
}
function admitted(family,raw){
 const base={...family,status:'HOLD',total:null,rows:[],attentionRecords:null,
  nextReview:pending(family.id,null),deliveryCertified:false,sourceReportedAt:null};
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.status!=='OBSERVED'||
  !validInt(raw.total)||!Array.isArray(raw.rows)||raw.rows.length>1000)return base;
 let total=0,attention=0;
 const rows=[];
 for(const r of raw.rows){
  if(!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).some(x=>!['category','status','record_count'].includes(x))||
    !validText(r.category)||!validText(r.status)||!validInt(r.record_count))return base;
  total+=r.record_count;
  if(!Number.isSafeInteger(total))return base;
  if(isAttention(family.id,r.status))attention+=r.record_count;
  rows.push(Object.freeze({category:r.category,status:r.status,recordCount:r.record_count,
   needsReview:isAttention(family.id,r.status)}));
 }
 if(total!==raw.total)return base;
 return {...base,status:'OBSERVED',total,rows,attentionRecords:attention,
  nextReview:pending(family.id,attention)};
}
export function deriveExecutiveSignals(packet,{from,to}={}){
 if(!date(from)||!date(to)||from>to||packet?.schemaVersion!=='VYNDI_ENTERPRISE_BI_V1'||
  packet?.readOnly!==true||packet?.scope!=='all'||packet.period?.from!==from||packet.period?.to!==to||
  !Array.isArray(packet.departments)||packet.departments.length!==0||
  packet.executiveSignals?.schemaVersion!=='VYNDI_EXECUTIVE_SIGNALS_V1'||
  packet.executiveSignals.readOnly!==true||
  !packet.executiveSignals.datasets||typeof packet.executiveSignals.datasets!=='object'||
  Array.isArray(packet.executiveSignals.datasets))problem('SOURCE_INVALID');
 const families=SIGNAL_FAMILIES.map(f=>admitted(f,packet.executiveSignals.datasets[f.id]));
 const timestamp=packet.executiveSignals.observedAt;
 const observedAt=typeof timestamp==='string'&&Number.isFinite(Date.parse(timestamp))?
  new Date(timestamp).toISOString():null;
 return Object.freeze({schemaVersion:'VAOS_EXECUTIVE_SIGNAL_VIEW_V1',
  period:{from,to},observedAt,datasets:families,
  observedCount:families.filter(x=>x.status==='OBSERVED').length,
  holdCount:families.filter(x=>x.status==='HOLD').length,
  readOnly:true,actionAuthorized:false,deliveryCertified:false,
  businessTruthCertified:false,crossFamilyTotalsAdditive:false});
}
