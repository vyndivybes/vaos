import {READ_DOMAINS} from './group-portfolio.mjs';

// Destinations already used by the governed group dashboard. No effects run here.
export const COCKPIT_DOMAINS=Object.freeze([
 {id:'project',label:'Projects',view:'projects',path:'planning',note:'Milestones and approved schedules'},
 {id:'commercial',label:'CRM & sales',view:'crm',path:'sales',note:'Sales orders; customer master not connected'},
 {id:'people',label:'HR & people',view:'hr',path:'people-office',note:'People Office authority and readiness'},
 {id:'engineering',label:'VEDM & engineering',view:'engineering',path:'engineering',note:'Configuration, verification and release'},
 {id:'procurement',label:'Procurement',view:'supply-chain',path:'purchase-execution',note:'Demand shortages and purchase execution'},
 {id:'inventory',label:'Inventory',path:'inventory',note:'Authoritative stock and material availability'},
 {id:'production',label:'Production',view:'manufacturing',path:'production',note:'Job cards and manufacturing WIP'},
 {id:'finance',label:'Finance',view:'finance',path:'financial-cockpit',note:'Ledger authority; consolidation on hold'},
]);
export const erpDestination=domain=>'https://vyndios.vayushastr.workers.dev/command/'+domain.path;
export function cockpitSources(snapshot){
 return COCKPIT_DOMAINS.map(domain=>{
  const contract=READ_DOMAINS.find(x=>x.id===domain.id);
  const source=snapshot?.sources?.find(x=>x.id===domain.id);
  const observed=snapshot?.readOnly===true&&snapshot?.actionAuthorized===false&&
   source?.status==='OBSERVED'&&source?.sourceAuthority===contract?.authority;
  return {...domain,observed,status:observed?'Source connected':'Setup / verify source'};
 });
}
export function employeeHref(id){
 return '/workforce-analytics.html?employee='+encodeURIComponent(String(id));
}
export function workforceChart(employees){
 const groups=new Map();
 for(const employee of employees){
  const label=employee.lifecycle||employee.lifecycleStatus||'Unverified';
  groups.set(label,(groups.get(label)||0)+1);
 }
 return [...groups].map(([label,value])=>({label,value}));
}
