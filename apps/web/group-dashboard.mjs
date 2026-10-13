import {GROUP_DIVISIONS,READ_DOMAINS,groupSignalRows} from './lib/group-portfolio.mjs';
import {chartSvg} from './lib/dashboard-charts.mjs';

const ERP='https://vyndios.vayushastr.workers.dev';
const destinations={
 commercial:'/command/sales',finance:'/command/financial-cockpit',
 people:'/command/people-office',procurement:'/command/purchase-execution',
 inventory:'/command/inventory',production:'/command/production',
 project:'/command/planning',engineering:'/command/engineering',
};
const focusModules={crm:'commercial',hr:'people',finance:'finance','supply-chain':'procurement',manufacturing:'production'};
const clean=(s)=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const state={snapshot:null,error:'',loading:false,selectedUnit:null,focus:'portfolio',lastFetch:null,chartKind:'columns'};
const safeExternal=(path)=>ERP+destinations[path];
const text=(value)=>clean(value);
const number=(value)=>Number(value||0).toLocaleString('en-IN');
function badge(status){
 return `<span class="va-chip va-chip--${status==='OBSERVED'?'ok':'hold'}">${status==='OBSERVED'?'Signed observation':'HOLD'}</span>`;
}
function groupSummary(){
 const snapshot=state.snapshot;
 const verified=snapshot?.sourceCoverage?.verified??null;
 return `<div class="va-group-hero">
   <div class="va-group-hero__copy"><p class="va-eyebrow">VĀYÚ SHASTR GROUP / PORTFOLIO INTELLIGENCE</p>
   <h2>A clearer view of your entire business.</h2>
   <p>Navigate six management divisions, inspect trusted ERP source health, and open the correct governed workspace to investigate.</p>
   <div class="va-group-hero__actions">
     <a class="va-button va-button--primary" target="_blank" rel="noopener noreferrer" href="${ERP}/command/analytics-studio">Open VYNDI Analytics ↗</a>
     <button type="button" class="va-button va-button--outline" data-portfolio-refresh ${state.loading?'disabled':''}>${state.loading?'Checking sources…':'↻ Verify connections'}</button>
   </div></div>
   <div class="va-group-hero__stat" aria-label="Signed source reachability">
      <span>Verified source reads</span><strong>${verified===null?'—':number(verified)}<small> / ${READ_DOMAINS.length}</small></strong>
      <p>Evidence of connectivity, not financial consolidation</p>
   </div>
 </div>`;
}
function tiles(){
 const x=state.snapshot;
 const count=x?.sourceCoverage?.verified??null;
 return `<div class="va-kpi-grid" aria-label="Group qualification summary">
   <article class="va-kpi-card"><span class="va-kpi-card__icon">◈</span><small>Business divisions</small><strong>6</strong><p>Management units · not separate companies</p></article>
   <article class="va-kpi-card"><span class="va-kpi-card__icon">⛉</span><small>Signed source reads</small><strong>${count===null?'—':number(count)}</strong><p>Of ${READ_DOMAINS.length} eligible VYNDI read contracts</p></article>
   <article class="va-kpi-card"><span class="va-kpi-card__icon">⇄</span><small>Attributed group financials</small><strong class="va-kpi-card__hold">HOLD</strong><p>Division mapping and eliminations incomplete</p></article>
   <article class="va-kpi-card"><span class="va-kpi-card__icon">⌁</span><small>Six-month group forecast</small><strong class="va-kpi-card__hold">HOLD</strong><p>Pending authorized budgets and division baselines</p></article>
 </div>`;
}
function divisionGrid(){
 const selected=state.selectedUnit;
 return `<div class="va-section-head"><div><p class="va-eyebrow">BUSINESS STRUCTURE</p><h3>Your six business divisions</h3><p>Select a division to see its management scope and authoritative data path.</p></div><span class="va-tag">Approved attribution required</span></div>
 <div class="va-unit-grid">${GROUP_DIVISIONS.map((unit,index)=>`
 <button type="button" class="va-unit ${selected===unit.id?'va-unit--active':''}" data-unit="${unit.id}" aria-pressed="${selected===unit.id?'true':'false'}">
  <span class="va-unit__icon va-unit__icon--${index}">${unit.icon}</span>
  <span class="va-unit__copy"><strong>${text(unit.short)}</strong><small>${text(unit.focus)}</small></span>
  <span class="va-unit__flag">Unattributed</span><span class="va-unit__chevron">↗</span>
 </button>`).join('')}</div>
 ${selected?`<div class="va-focus-panel"><div><p class="va-eyebrow">SELECTED DIVISION</p><h4>${text(GROUP_DIVISIONS.find(x=>x.id===selected)?.label)}</h4><p>${text(GROUP_DIVISIONS.find(x=>x.id===selected)?.focus)}</p><p class="va-focus-panel__hold">No certified financial figures or operational allocations are available until separate maker/checker classification is approved in VYNDI OS.</p></div><a href="${ERP}/command/analytics-studio" target="_blank" rel="noopener noreferrer" class="va-button va-button--outline">Open attribution workspace ↗</a></div>`:''}`;
}
function sourceGrid(){
 const snap=state.snapshot;
 const list=snap?.sources||READ_DOMAINS.map(x=>({...x,status:'HOLD'}));
 const focus=focusModules[state.focus];
 const chart=snap?groupSignalRows(snap):[{label:'Signed read',value:0},{label:'Hold / not connected',value:READ_DOMAINS.length}];
 const observed=chart[0].value;
 const pct=(observed/READ_DOMAINS.length)*100;
 return `<div class="va-insights-grid">
 <section class="va-panel va-panel--chart"><div class="va-panel__heading"><div><p class="va-eyebrow">SOURCE COVERAGE</p><h3>Operational intelligence feeds</h3></div><span class="va-tag">Read only</span></div>
  <div class="va-coverage"><div class="va-coverage__donut" style="--coverage:${pct}%"><div><strong>${observed}<small>/${READ_DOMAINS.length}</small></strong><span>read contracts</span></div></div>
   <div class="va-coverage__legend"><p><i class="va-dot va-dot--on"></i> Signed source reads <strong>${observed}</strong></p><p><i class="va-dot va-dot--off"></i> Hold / unverified <strong>${chart[1].value}</strong></p></div>
  </div><p class="va-chart-footnote">This visual shows connection qualification, not company revenue, headcount, stock value or profit.</p>
 </section>
 <section class="va-panel va-panel--sources"><div class="va-panel__heading"><div><p class="va-eyebrow">CONNECTED INTELLIGENCE</p><h3>ERP domain readiness</h3></div></div>
 <div class="va-domain-list">${list.map(source=>`<div class="va-domain-row ${focus===source.id?'va-domain-row--focus':''}">
   <span class="va-domain-row__name"><strong>${text(source.label)}</strong><small>${source.id==='commercial'?'Sales-order pipeline; customer CRM master not connected':'Authoritative read-only service check'}</small></span>
   ${badge(source.status)}
   <a class="va-domain-row__link" href="${safeExternal(source.id)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${text(source.label)} in VYNDI OS">↗</a>
 </div>`).join('')}</div>
 </section></div>`;
}
function decisionStrip(){
 const missing=state.snapshot?.sources?.filter(x=>x.status==='HOLD').map(x=>x.label)||[];
 return `<section class="va-panel va-decisions"><div class="va-panel__heading"><div><p class="va-eyebrow">NEXT GOVERNED ACTIONS</p><h3>What needs attention</h3></div><span class="va-tag va-tag--warn">Management consolidation partial</span></div>
 <div class="va-next-grid">
   <div class="va-next"><span>01</span><strong>Classify existing records</strong><p>Assign source documents, people and CRM records to the correct management unit with independent evidence and approval.</p></div>
   <div class="va-next"><span>02</span><strong>Reconcile inter-unit transactions</strong><p>Eliminate internal charges only where both sides and independent references match. Do not double-count revenue.</p></div>
   <div class="va-next"><span>03</span><strong>Qualify group forecast</strong><p>Approve unit-level budgets, shared-cost allocation rules and comparable reporting periods.</p></div>
 </div>
 ${missing.length?`<p class="va-hold-note" role="status">Unverified source observations: ${text(missing.join(', '))}. HOLD means unknown, not zero.</p>`:''}
 </section>`;
}

function drawDepartment(root){
 const id=focusModules[state.focus], source=READ_DOMAINS.find(x=>x.id===id);
 const labels={crm:'CRM & Sales',hr:'Human Resources',finance:'Finance','supply-chain':'Supply Chain',manufacturing:'Manufacturing'};
 const notes={crm:'Sales pipeline is observed; the complete customer CRM master and revenue remain unqualified.',hr:'People Office source reachability is not proof of payroll, hiring or employee headcount.',finance:'Financial balances, budgets and inter-unit attribution are not certified from connectivity.', 'supply-chain':'Procurement and stock require separate SKU, unit, BOM and approved release evidence.',manufacturing:'Production source reachability is not evidence of released materials, qualified WIP or throughput.'};
 const entries=state.snapshot?.sources||READ_DOMAINS.map(x=>({...x,status:'HOLD'}));
 const current=entries.find(x=>x.id===id);
 const signed=entries.filter(x=>x.status==='OBSERVED').length;
 const counts=[{label:'Signed reads',value:signed},{label:'Unverified reads',value:entries.length-signed}];
 root.innerHTML=`<div class="va-focused-dashboard">
  <header><p class="va-eyebrow">DEPARTMENT INTELLIGENCE · SIGNED OBSERVATION ONLY</p><h2>${text(labels[state.focus])}</h2>
   <p>${text(notes[state.focus])}</p><p>These are connectivity qualifications, not business performance metrics. No unknown value is displayed as zero.</p>
   <p><a class="va-button va-button--primary" target="_blank" rel="noopener noreferrer" href="${safeExternal(id)}">Open ${text(labels[state.focus])} in VYNDI OS ↗</a>
    <button type="button" class="va-button va-button--outline" data-portfolio-refresh>Refresh evidence</button></p>
  </header>
  ${state.error?`<p class="va-hold-note" role="status">${text(state.error)}</p>`:''}
  <div class="va-focused-metrics"><article><small>Selected read contract</small><strong>${text(source?.label||'Unconfigured')}</strong>${current?badge(current.status):badge('HOLD')}</article>
  <article><small>Signed source reads</small><strong>${state.snapshot?signed+' / '+READ_DOMAINS.length:'Unavailable'}</strong><span>Across all eight source contracts</span></article>
  <article><small>Approved department KPIs</small><strong>HOLD</strong><span>Not available through this read contract</span></article></div>
  <details class="va-dashboard-fold" open><summary>Readiness charts and graph styles</summary>
   <label>Chart style <select data-chart-kind><option value="columns">Columns</option><option value="bars">Horizontal bars</option><option value="donut">Doughnut</option></select></label>
   <div data-readiness-chart>${state.snapshot?chartSvg(counts,state.chartKind,'Signed read contract coverage'):'<p>Verified observations not available. Chart withheld.</p>'}</div>
   <p>Charted values are signed source counts, not sales, cash flow, headcount, inventory quantity or production output.</p></details>
  <details class="va-dashboard-fold"><summary>Search and inspect connected data sources</summary>
   <label>Filter contracts <input type="search" data-contract-search placeholder="Search finance, sales, production…" /></label>
   <div class="va-contract-list">${entries.map(x=>`<article data-read-contract="${text(x.id+' '+x.label.toLowerCase())}"><strong>${text(x.label)}</strong>${badge(x.status)}
    <a href="${safeExternal(x.id)}" target="_blank" rel="noopener noreferrer">Open source ↗</a></article>`).join('')}</div>
  </details>
  <details class="va-dashboard-fold"><summary>Outstanding qualification and audit requirements</summary>
    <p>Complete dataset and source revisions, departmental maker-checker review, engineering release where applicable, and authoritative transaction values remain required. This screen performs no production writes.</p>
  </details>
 </div>`;
 root.querySelector('[data-portfolio-refresh]')?.addEventListener('click',()=>void refreshPortfolio(root,{force:true}));
 const selector=root.querySelector('[data-chart-kind]');selector.value=state.chartKind;
 selector.addEventListener('change',e=>{state.chartKind=e.target.value;root.querySelector('[data-readiness-chart]').innerHTML=state.snapshot?chartSvg(counts,state.chartKind,'Signed read contract coverage'):'<p>Verified observations not available. Chart withheld.</p>';});
 root.querySelector('[data-contract-search]')?.addEventListener('input',e=>{
  const term=e.target.value.toLowerCase().trim();root.querySelectorAll('[data-read-contract]').forEach(node=>{node.hidden=!node.dataset.readContract.includes(term);});
 });
}

function draw(root){
 if(!root)return;
 if(state.focus!=='portfolio'){drawDepartment(root);return;}
 root.innerHTML=`${groupSummary()}
 ${state.error?`<div role="status" class="va-hold-note">Source observation unavailable. ${text(state.error)} All unverified measures remain on HOLD.</div>`:''}
 ${tiles()}
 <div class="va-panel va-panel--units">${divisionGrid()}</div>
 ${sourceGrid()}
 ${decisionStrip()}
 <p class="va-group-footer">VAOS does not create or modify source records, salaries, purchase orders, accounting journals or human approvals from this view. Use VYNDI OS for governed operational transactions. External business apps and community data still require qualified connections.</p>`;
 root.querySelector('[data-portfolio-refresh]')?.addEventListener('click',()=>{void refreshPortfolio(root,{force:true});});
 root.querySelectorAll('[data-unit]').forEach(button=>button.addEventListener('click',()=>{
  state.selectedUnit=state.selectedUnit===button.dataset.unit?null:button.dataset.unit;
  draw(root);
 }));
}
export async function refreshPortfolio(root,{force=false}={}){
 if(state.loading)return;
 if(state.snapshot&&!force){draw(root);return;}
 state.loading=true;state.error='';draw(root);
 try{
  const response=await fetch('/api/group-portfolio',{credentials:'same-origin',cache:'no-store',headers:{'Accept':'application/json'}});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(response.status===403?'Founder access is required.':response.status===401?'Please sign in again.':'Signed VYNDI observations are currently unavailable.');
  const data=payload.data;
  if(!data||!Array.isArray(data.sources)||data.financialConsolidation!=='HOLD'||data.sources.length!==READ_DOMAINS.length)throw Error('The management portfolio response did not satisfy the evidence contract.');
  state.snapshot=data;state.lastFetch=Date.now();
 }catch(e){state.error=String(e?.message||'Unknown source error');state.snapshot=null;}
 finally{state.loading=false;draw(root);}
}
export function showGroupDashboard(root,{focus='portfolio'}={}){
 state.focus=focus;
 if(!root)return;
 draw(root);
 if(!state.snapshot&&!state.loading)void refreshPortfolio(root);
}
