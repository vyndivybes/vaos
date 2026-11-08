/** Interactive canonical CRM / HR / dispatch aggregates, each at its own grain.
 * All data must have been validated by deriveExecutiveSignals.
 */
const el=(tag,cls,text)=>{
 const node=document.createElement(tag);
 if(cls)node.className=cls;
 if(text!==undefined)node.textContent=String(text);
 return node;
};
const nfmt=new Intl.NumberFormat('en-IN',{maximumFractionDigits:0});
const safeCount=value=>Number.isSafeInteger(value)&&value>=0?nfmt.format(value):'—';
export function renderExecutiveSignals(host,view){
 if(!host||view?.schemaVersion!=='VAOS_EXECUTIVE_SIGNAL_VIEW_V1'||
  view.readOnly!==true||view.actionAuthorized!==false)throw Error('EXECUTIVE_SIGNAL_VIEW_INVALID');
 host.replaceChildren();
 const section=el('section','evi-aggregates');
 const top=el('div','evi-signal-head');
 top.append(el('span','evi-kicker','SIGNED EXECUTIVE AGGREGATES'),
  el('h3','','Seven independent sources. One clear investigation path.'),
  el('p','',view.observedCount+' source families observed; '+view.holdCount+
   ' on HOLD. These are current canonical aggregates, not period-filtered time series or certified forecasts.'));
 section.append(top);
 const cards=el('div','evi-signal-grid');
 const detail=el('section','evi-signal-detail');
 let selected=view.datasets.find(x=>x.status==='OBSERVED')?.id||view.datasets[0]?.id;
 function show(){
  const active=view.datasets.find(x=>x.id===selected);
  detail.replaceChildren();
  if(!active)return;
  const header=el('div','evi-card-heading');
  header.append(el('h3','',active.label+' — '+(active.status==='OBSERVED'?'source-reported statuses':'HOLD')),
   el('p','',active.context+'. Record counts belong to this dataset only.'));
  detail.append(header);
  if(active.status!=='OBSERVED'){
   detail.append(el('p','evi-empty','HOLD — canonical source unavailable or did not satisfy aggregate integrity checks. No zero was inferred.'));
  }else if(!active.rows.length){
   detail.append(el('p','evi-empty','The qualified canonical aggregate returned no status rows. This is not a forecast or evidence of future demand.'));
  }else{
   const list=el('div','evi-signal-breakdown');
   const ordered=[...active.rows].sort((a,b)=>b.recordCount-a.recordCount);
   for(const item of ordered.slice(0,20)){
    const row=el('div','evi-signal-bar');
    if(item.needsReview)row.dataset.review='true';
    const label=el('div','evi-signal-bar-label');
    label.append(el('span','',item.category+' / '+item.status),
      el('strong','',safeCount(item.recordCount)));
    const track=el('div','evi-signal-track');
    const fill=el('div','evi-signal-fill');
    fill.style.width=(active.total===0?0:item.recordCount/active.total*100).toFixed(2)+'%';
    track.append(fill);row.append(label,track);list.append(row);
   }
   detail.append(list);
   if(ordered.length>20)detail.append(el('p','evi-source-note','Showing the largest 20 of '+ordered.length+' returned source status groups; totals include all groups.'));
  }
  detail.append(el('p','evi-signal-review',active.nextReview));
  const link=el('a','evi-open-source','Inspect original VAOS source ↗');
  link.href=active.href;detail.append(link);
  detail.append(el('p','evi-source-note',
   'Record status groups can overlap across families. Do not sum CRM customer, order, HR or dispatch totals. Dispatch statuses do not prove carrier delivery.'));
 }
 for(const item of view.datasets){
  const button=el('button','evi-signal-card');button.type='button';
  button.dataset.status=item.status;
  button.setAttribute('aria-pressed',item.id===selected?'true':'false');
  button.append(el('span','evi-signal-label',item.label),
   el('strong','evi-signal-value',safeCount(item.total)),
   el('small','',item.status==='OBSERVED'?'Source-observed records':'HOLD — unknown count'));
  button.addEventListener('click',()=>{
   selected=item.id;
   for(const child of cards.children)child.setAttribute('aria-pressed',child===button?'true':'false');
   show();
  });
  cards.append(button);
 }
 section.append(cards,detail);
 const footer=el('p','evi-boundary',
  'Aggregate counts refer to complete canonical source status groups as of the source read, not to the selected reporting period. No cross-family totals, financial consolidation, order forecasts or payroll decisions are inferred.');
 section.append(footer);
 host.append(section);show();
}
