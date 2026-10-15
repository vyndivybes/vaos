// Current bounded observations only. No accounting totals are inferred from record counts.
export const DEPARTMENT_EMPLOYEES=Object.freeze([
 {employeeId:'commercial',label:'Sales & Commercial'},
 {employeeId:'finance',label:'Finance'},
 {employeeId:'people',label:'HR & People'},
 {employeeId:'production',label:'Production'},
 {employeeId:'procurement',label:'Procurement'},
 {employeeId:'inventory',label:'Inventory'},
 {employeeId:'engineering-configuration',label:'Engineering'},
 {employeeId:'maintenance',label:'Maintenance'},
]);
export function summarizeDepartments(reports=[],catalog=DEPARTMENT_EMPLOYEES){
 const byEmployee=new Map();
 for(const r of reports){
  if(!r||!catalog.some(x=>x.employeeId===r.employeeId)||byEmployee.has(r.employeeId))throw Error('INVALID_DEPARTMENT_SOURCE');
  if(!Number.isSafeInteger(r.datedRecords)||r.datedRecords<0||
     !Number.isSafeInteger(r.undatedCurrentRecords)||r.undatedCurrentRecords<0||
     !Array.isArray(r.groups)||!Array.isArray(r.statusDistribution))throw Error('INVALID_DEPARTMENT_COUNTS');
  byEmployee.set(r.employeeId,r);
 }
 return catalog.map(x=>{
  const r=byEmployee.get(x.employeeId);
  return Object.freeze({...x,
   state:!r?'NOT_CONNECTED':r.groups.some(g=>g.mayBeTruncated)?'PARTIAL':'BOUNDED_SAMPLE',
   datedRecords:r?r.datedRecords:null,
   currentUndated:r?r.undatedCurrentRecords:null,
   statuses:r?r.statusDistribution:[],
   source:r?r.sourceAuthority:null,
  });
 });
}
