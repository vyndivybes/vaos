// VAOS Spatial Command: source-gated, read-only projection of canonical VYNDI aggregates.
// This module is safe to import in Node tests and browsers; it never makes requests or writes.
export const SPATIAL_DATASETS=Object.freeze([
 {id:'crmCustomers',label:'CRM customers',group:'Commercial',href:'/visual-intelligence.html?viz=evidence'},
 {id:'crmFollowups',label:'Customer follow-ups',group:'Commercial',href:'/visual-intelligence.html?viz=evidence'},
 {id:'crmOrderLinks',label:'CRM-linked orders',group:'Commercial',href:'/visual-intelligence.html?viz=evidence'},
 {id:'hrWorkforce',label:'People records',group:'People',href:'/workforce-analytics.html'},
 {id:'hrAttendance',label:'Attendance',group:'People',href:'/workforce-analytics.html'},
 {id:'hrPayrollReadiness',label:'Payroll readiness',group:'People',href:'/workforce-analytics.html'},
 {id:'dispatch',label:'Dispatch',group:'Logistics',href:'/visual-intelligence.html?viz=evidence'}
].map(x=>Object.freeze(x)));
export const GRAPH_NODES=Object.freeze([
 {id:'VAOS',label:'VAOS',kind:'conceptual',actionAuthorized:false,group:'control'},
 {id:'VYNDI OS',label:'VYNDI OS',kind:'conceptual',actionAuthorized:false,group:'control'},
 {id:'Graphify',label:'Graphify',kind:'conceptual',actionAuthorized:false,group:'knowledge'},
 {id:'Graphiti',label:'Graphiti',kind:'conceptual',actionAuthorized:false,group:'knowledge'},
 {id:'Obsidian',label:'Obsidian',kind:'conceptual',actionAuthorized:false,group:'knowledge'},
 {id:'Neural Schema',label:'Neural Schema',kind:'conceptual',actionAuthorized:false,group:'knowledge'},
 {id:'Brain Graph',label:'Brain Graph',kind:'conceptual',actionAuthorized:false,group:'knowledge'},
 {id:'LLM Wiki',label:'LLM Wiki',kind:'conceptual',actionAuthorized:false,group:'knowledge'},
 {id:'VEDM',label:'VEDM',kind:'conceptual',actionAuthorized:false,group:'engineering'}
].map(x=>Object.freeze(x)));
const SOURCE='VYNDI_OS_COMPLETE_CANONICAL_AGGREGATE';
const safeCount=value=>Number.isSafeInteger(value)&&value>=0;
const bounded=value=>typeof value==='string' && value.trim() && value.length<=120 && !/[\u0000-\u001f\u007f]/.test(value);
const hold=definition=>({...definition,status:'HOLD',total:null,rows:[],source:null,reason:'Source not independently observed',readOnly:true,actionAuthorized:false});
function verifiedDataset(definition,raw){
 if(raw?.status!=='OBSERVED' || raw?.source!==SOURCE || !safeCount(raw.total)
    || !Array.isArray(raw.rows) || raw.rows.length>1000)return hold(definition);
 let total=0;const rows=[];
 for(const item of raw.rows){
  if(!item || !bounded(item.category) || !bounded(item.status) || !safeCount(item.record_count))
    return {...hold(definition),reason:'Source dataset validation failed'};
  total+=item.record_count;
  if(!safeCount(total))return {...hold(definition),reason:'Source total overflow'};
  rows.push({category:item.category,status:item.status,count:item.record_count});
 }
 if(total!==raw.total)return {...hold(definition),reason:'Aggregate count does not reconcile'};
 return {...definition,status:'OBSERVED',total,rows,source:SOURCE,reason:null,readOnly:true,actionAuthorized:false};
}
/** No output ever implies business write authority. Partial source failures remain visible. */
export function projectSpatialSignals(response){
 const data=response?.data??response;
 const valid=data?.schemaVersion==='VYNDI_ENTERPRISE_BI_V1'&&data?.readOnly===true
   &&data?.executiveSignals?.schemaVersion==='VYNDI_EXECUTIVE_SIGNALS_V1'
   &&data?.executiveSignals?.readOnly===true && data?.executiveSignals?.datasets
   && typeof data.executiveSignals.datasets==='object' && !Array.isArray(data.executiveSignals.datasets);
 const datasets=SPATIAL_DATASETS.map(def=>valid?verifiedDataset(def,data.executiveSignals.datasets[def.id]):hold(def));
 const observed=datasets.filter(x=>x.status==='OBSERVED').length;
 return {status:!valid||observed===0?'HOLD':observed===datasets.length?'OBSERVED':'PARTIAL',
   observed,expected:datasets.length,observedAt:valid&&typeof data.executiveSignals.observedAt==='string'?data.executiveSignals.observedAt:null,
   datasets,readOnly:true,actionAuthorized:false,reason:valid?null:'Signed executive source unavailable or invalid'};
}
/** User filtering happens only over already validated, privacy-preserving aggregate rows. */
export function selectSheetRows(snapshot,datasetId,search=''){
 const data=snapshot?.datasets?.find(x=>x.id===datasetId&&x.status==='OBSERVED');
 if(!data)return [];
 const query=String(search).trim().toLowerCase().slice(0,100);
 return data.rows.filter(x=>!query || (x.category+' '+x.status).toLowerCase().includes(query))
   .slice(0,1000).map(x=>({category:x.category,status:x.status,count:x.count}));
}
