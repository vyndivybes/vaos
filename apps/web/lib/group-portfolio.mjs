/** VAOS management portfolio. Never imply division-wise monetary totals from
 * signed domain observations. Division attribution and inter-unit elimination
 * remain governed in VYNDI OS; no source identities leave that service.
 */
export const GROUP_DIVISIONS=Object.freeze([
 {id:'corporate',label:'Vāyú Shastr Corporate',short:'Corporate',type:'management_unit',focus:'Group governance · capital · shared services',icon:'◆'},
 {id:'carbon',label:'Carbon Bicycle Division',short:'Carbon bicycles',type:'management_unit',focus:'Engineering · composites · release gates',icon:'◈'},
 {id:'aluminium',label:'Aluminium Bicycle Division',short:'Aluminium bicycles',type:'management_unit',focus:'Production · inventory · fulfillment',icon:'▣'},
 {id:'software',label:'VYNDI OS / VAOS Software',short:'Software',type:'management_unit',focus:'Engineering delivery · infrastructure · SaaS',icon:'⌘'},
 {id:'vybes',label:'Vybes Community',short:'Vybes',type:'management_unit',focus:'Community · membership · engagement',icon:'◎'},
 {id:'merchandise',label:'Merchandise & Terrain Medals',short:'Merchandise',type:'management_unit',focus:'Orders · print production · stock',icon:'⬡'},
]);
export const READ_DOMAINS=Object.freeze([
 {id:'commercial',label:'Sales pipeline',actionType:'COMMERCIAL.OBSERVE_PIPELINE',authority:'listSalesOrders',effectClass:'read',target:'sales'},
 {id:'finance',label:'Finance',actionType:'FINANCE.OBSERVE_LEDGER',authority:'getAccountingWorkbench',effectClass:'read',target:'finance'},
 {id:'people',label:'HR / workforce',actionType:'PEOPLE.OBSERVE_WORKFORCE',authority:'listPeopleOfficeAuthority',effectClass:'read',target:'people-office'},
 {id:'procurement',label:'Procurement',actionType:'PROCUREMENT.OBSERVE_SHORTAGE',authority:'getConfiguredDemandShortages',effectClass:'read',target:'purchase-execution'},
 {id:'inventory',label:'Inventory',actionType:'INVENTORY.OBSERVE_STOCK',authority:'getAuthoritativeInventory',effectClass:'read',target:'inventory'},
 {id:'production',label:'Production',actionType:'PRODUCTION.OBSERVE_WIP',authority:'getProductionJobCards',effectClass:'read',target:'production'},
 {id:'project',label:'Projects',actionType:'PROJECT.OBSERVE_SCHEDULE',authority:'readGovernedProgramSchedule',effectClass:'read',target:'planning'},
 {id:'engineering',label:'Engineering',actionType:'ENGINEERING.OBSERVE_CONFIGURATION',authority:'getEngineeringChangeControlState',effectClass:'read',target:'engineering'},
]);
export function buildGroupPortfolio(observations=[],{asOf=new Date().toISOString()}={}){
 const byId=new Map(observations.filter(x=>x&&typeof x==='object').map(x=>[x.id,x]));
 const sources=READ_DOMAINS.map(x=>{
   const observed=byId.get(x.id);
   return {id:x.id,label:x.label,status:observed?.status==='OBSERVED'&&observed?.authority===x.authority?'OBSERVED':'HOLD',
     sourceAuthority:x.authority,target:x.target};
 });
 const verified=sources.filter(x=>x.status==='OBSERVED').length;
 return {
   generatedAt:asOf,status:verified===0?'NOT_QUALIFIED':verified===sources.length?'SOURCE_READS_VERIFIED':'PARTIAL',
   scope:'VYNDI_OS_SIGNED_READS_ONLY',sourceCoverage:{verified,total:sources.length},
   sources,
   divisions:GROUP_DIVISIONS.map(x=>({...x,status:'UNATTRIBUTED',financialValue:null})),
   financialConsolidation:'HOLD',groupRevenue:null,groupCash:null,groupProfit:null,
   perDivisionForecastQualified:false,crmCustomerMasterConnected:false,intercompanyEliminationQualified:false,
   note:'Read observations confirm source reachability, NOT complete division attribution, accounting reliance, HR qualification, CRM customer-master integration or financial consolidation.',
 };
}
export function groupSignalRows(snapshot){
 const verified=Number.isInteger(snapshot?.sourceCoverage?.verified)?snapshot.sourceCoverage.verified:0;
 return [{label:'Signed read',value:verified},{label:'Hold / not connected',value:Math.max(0,READ_DOMAINS.length-verified)}];
}
