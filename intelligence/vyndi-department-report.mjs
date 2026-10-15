// Founder-only presentation policy for existing signed VYNDI OS read authorities.
// No generated KPIs, sales values, or forecasts. Only bounded, observed source fields.
export const DEPARTMENT_READS=Object.freeze({
 commercial:{action:'COMMERCIAL.OBSERVE_PIPELINE',label:'Commercial / CRM',authority:'listSalesOrders'},
 procurement:{action:'PROCUREMENT.OBSERVE_SHORTAGE',label:'Procurement',authority:'getConfiguredDemandShortages'},
 inventory:{action:'INVENTORY.OBSERVE_STOCK',label:'Inventory',authority:'getAuthoritativeInventory'},
 production:{action:'PRODUCTION.OBSERVE_WIP',label:'Production / MES',authority:'getProductionJobCards'},
 maintenance:{action:'MAINTENANCE.OBSERVE_ASSET',label:'Maintenance',authority:'getAssetMaintenanceState'},
 finance:{action:'FINANCE.OBSERVE_LEDGER',label:'Finance',authority:'getAccountingWorkbench'},
 people:{action:'PEOPLE.OBSERVE_WORKFORCE',label:'HR / People',authority:'listPeopleOfficeAuthority'},
 'engineering-configuration':{action:'ENGINEERING.OBSERVE_CONFIGURATION',label:'Engineering Configuration',authority:'getEngineeringChangeControlState'}
});
const FIELD_ALLOW=/^(id|order_id|sales_order_id|job_card_id|work_order_id|sku|item|category|product_label|product|variant_id|name|department|role|account_code|journal_id|source_ref|reference|transaction_date|posting_date|due_date|due_month|created_at|updated_at|closed_at|completed_at|posted_at|date|status|state|stage|priority|unit|units|quantity|required_quantity|available_quantity|physical_quantity|shortage_quantity|reserved_quantity|stock_quantity|available_to_promise|total|amount|debit|credit|cost|balance|net_amount|approved_at|released_at|bom_revision|revision|baseline|record_origin|release_disposition|bom_link_qualified|production_release_qualified)$/i;
const DATE_FIELDS=['updated_at','completed_at','posted_at','posting_date','transaction_date','created_at','approved_at','released_at','date'];
const SCOPES={
 commercial:['records'],procurement:['records'],inventory:['records'],
 production:['records'],maintenance:['equipment','workOrders'],finance:['ledger','journals'],
 people:['people','authority'],'engineering-configuration':['changeOrders','baselines']
};
function plain(value){return typeof value==='string'?value.slice(0,256):typeof value==='number'&&Number.isFinite(value)?value:typeof value==='boolean'?value:null;}
export function sourceDate(record){
 for(const field of DATE_FIELDS){
  const raw=record?.[field];
  if(typeof raw==='string'&&/^\d{4}-\d\d-\d\d/.test(raw)&&Number.isFinite(Date.parse(raw.slice(0,10))))return raw.slice(0,10);
 }
 return null;
}
export function buildDepartmentSourceReport({employeeId,source,from,to,observedAt=new Date().toISOString()}={}){
 if(!DEPARTMENT_READS[employeeId]||source?.actionType!==DEPARTMENT_READS[employeeId].action||
   source?.sourceAuthority!==DEPARTMENT_READS[employeeId].authority)throw Error('DEPARTMENT_AUTHORITY_MISMATCH');
 if(!/^\d{4}-\d\d-\d\d$/.test(from||'')||!/^\d{4}-\d\d-\d\d$/.test(to||'')||
   !Number.isFinite(Date.parse(from))||!Number.isFinite(Date.parse(to))||from>to)throw Error('INVALID_PERIOD');
 const entries=[],groups=[];
 for(const group of SCOPES[employeeId]){
  const sourceRows=source.data?.[group];if(!Array.isArray(sourceRows))throw Error('VYNDI_SOURCE_SHAPE_MISSING');
  if(sourceRows.length>100)throw Error('SOURCE_WINDOW_OVERFLOW');
  const inWindow=sourceRows.filter(row=>{
   const date=sourceDate(row);return !date||(date>=from&&date<=to);
  });
  let dated=0,undated=0;
  for(const record of inWindow){
   if(!record||typeof record!=='object'||Array.isArray(record))continue;
   const recordDate=sourceDate(record);
   if(recordDate)dated++;else undated++;
   const fields=Object.entries(record).filter(([k,v])=>FIELD_ALLOW.test(k)&&plain(v)!==null)
    .slice(0,22).map(([field,value])=>({field,value:plain(value)}));
   if(fields.length)entries.push({group,date:recordDate,fields});
  }
  groups.push({group,sampled:sourceRows.length,inPeriod:dated,currentUndated:undated,mayBeTruncated:sourceRows.length===100});
 }
 const datedRows=entries.filter(e=>e.date);
 const statuses=new Map();
 for(const entry of datedRows){
  const v=entry.fields.find(f=>['status','state','stage'].includes(f.field.toLowerCase()))?.value;
  const k=typeof v==='string'&&v.trim()?v.slice(0,40):'Status not recorded';
  statuses.set(k,(statuses.get(k)||0)+1);
 }
 return {
  schemaVersion:'VAOS_VYNDI_DEPARTMENT_REPORT_V1',employeeId,
  department:DEPARTMENT_READS[employeeId].label,sourceAuthority:source.sourceAuthority,
  observedAt,period:{from,to},readOnly:true,
  coverage:'BOUNDED_SIGNED_SOURCE_SAMPLE',completePeriod:false,
  groups,records:entries.slice(0,200),
  datedRecords:datedRows.length,
  undatedCurrentRecords:entries.length-datedRows.length,
  statusDistribution:[...statuses].map(([label,count])=>({label,count})).sort((a,b)=>b.count-a.count),
  forecast:{status:'NOT_QUALIFIED',reason:'Existing VYNDI signed read endpoint has not supplied a qualified dated forecast for this department.'},
  notes:[
   'Timestamped rows are filtered by a recorded business date. Records without dates are current-state observations, not historical activity.',
   'Signed VYNDI bridge reads at most 100 latest records per source collection; these numbers are not exhaustive period totals.',
   'Source rows are business records. They do not by themselves establish an AI employee executed or audited the transaction.',
   'Completion, audit and forecast qualification must be corroborated with governed VYNDI/VAOS evidence.'
  ]
 };
}
