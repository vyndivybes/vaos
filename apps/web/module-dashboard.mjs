import {normalizeCounts,chartSvg} from './lib/dashboard-charts.mjs';

export function renderModuleDashboard(panel,module,model){
 if(!panel)return;
 const domain=model.domainWorkspaces?.[module.id],view=model.operationalViews?.[module.id];
 const rows=domain?.records||view?.rows||[];
 let raw=[];
 if(domain?.summary)raw=Object.entries(domain.summary).map(([label,value])=>({label,value}));
 else if(view?.summary)raw=view.summary.map(x=>({label:x.label,value:x.value}));
 else if(module.id==='approvals')raw=[{label:'Pending human decisions',value:model.approvals.length}];
 else if(module.id==='digital-thread')raw=[
  {label:'Persisted nodes',value:model.traceGraph?.nodes?.length},
  {label:'Explicit trace links',value:model.traceGraph?.edges?.length}];
 const series=normalizeCounts(raw);
 panel.hidden=false;
 const label=panel.querySelector('#module-evidence-source');
 label.textContent='Source: '+(domain?'durable domain evidence':view?'authenticated control-plane snapshot':'governed graph / approval record')+
  '. These are recorded counters, not financial results; categories may overlap. Qualification still requires independent review.';
 const style=panel.querySelector('#module-evidence-style');
 const container=panel.querySelector('#module-evidence-chart');
 const plot=()=>{container.innerHTML=chartSvg(series,style.value,'VAOS '+module.label+' record counts');};
 style.onchange=plot;
 plot();
 const input=panel.querySelector('#module-record-search');
 const count=panel.querySelector('#module-search-result');
 input.value='';
 const filter=()=>{
  const term=input.value.trim().toLowerCase();
  const host=panel.parentElement;
  let visible=0;
  const targets=host.querySelectorAll('#domain-record-list .domain-record-row, #operational-record-list .operational-record');
  targets.forEach(el=>{el.hidden=term.length>0&&!el.textContent.toLowerCase().includes(term);if(!el.hidden)visible++;});
  count.textContent=targets.length ? visible+' of '+targets.length+' displayed · search changes visibility, not chart totals' :
   'No searchable record rows in this module. Missing records are not zero performance.';
 };
 input.oninput=filter;
 filter();
}
