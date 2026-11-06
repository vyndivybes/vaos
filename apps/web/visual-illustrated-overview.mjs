import {deriveVisualOverview} from './lib/visual-overview-model.mjs';
import {renderSankey,renderHeatmap,renderWaterfall,renderFunnel,renderTimeline,renderSimulation} from './advanced-visual-renderers.mjs';
import {mountFactoryTwin} from './factory-twin-view.mjs';
import {runMonteCarlo} from './lib/predictive-simulation.mjs';

const el=(tag,className,value)=>{
 const node=document.createElement(tag);
 if(className)node.className=className;
 if(value!==undefined)node.textContent=String(value);
 return node;
};
const fmt=value=>value===null||value===undefined?'—':new Intl.NumberFormat('en-IN',{maximumFractionDigits:1}).format(value);
const percent=(value,total)=>value===null||total<=0?null:Math.max(0,Math.min(100,100*value/total));
const DEMO_FORECAST=Object.freeze({demand:100,capacity:120,price:2500,unitCost:1700,fixedCost:50000,openingCash:200000,capex:10000,volatilityPct:18,horizonMonths:12,iterations:400,seed:42});

function chip(text,variant='neutral'){return el('span','av-ov-chip av-ov-chip--'+variant,text);}
function button(text,id,navigate){
 const node=el('button','av-ov-action',text);
 node.type='button';
 node.setAttribute('aria-label','Open full '+id+' visualization');
 node.addEventListener('click',()=>navigate(id));
 return node;
}
function card(kind,label,title,caption,view,navigate){
 const node=el('article','av-ov-card '+kind);
 const heading=el('div','av-ov-card-head'),left=el('div');
 left.append(el('p','av-ov-eyebrow',label),el('h3',undefined,title),el('p','av-ov-subtitle',caption));
 heading.append(left,button('Explore ↗',view,navigate));
 const chart=el('div','av-ov-plot');
 node.append(heading,chart);
 return {node,heading,chart};
}
function metric(label,value,detail,rate,color){
 const node=el('article','av-overview-kpi');
 node.style.setProperty('--ov-kpi-color',color);
 const row=el('div','av-overview-kpi-label');
 row.append(el('span',undefined,label),chip('SCENARIO','muted'));
 const number=el('strong','av-overview-kpi-number',fmt(value));
 const explanation=el('p',undefined,detail);
 const bottom=el('div','av-overview-kpi-foot'),rail=el('div','av-overview-kpi-track'),fill=el('div','av-overview-kpi-fill');
 fill.style.width=(rate??0).toFixed(1)+'%';rail.append(fill);
 bottom.append(rail,el('span',undefined,rate===null?'No denominator':rate.toFixed(1)+'% of inbound'));
 node.append(row,number,explanation,bottom);
 return node;
}
function meter(host,label,value,total,color){
 const item=el('div','av-ov-meter-row'),heading=el('div','av-ov-meter-heading');
 heading.append(el('span',undefined,label),el('strong',undefined,fmt(value)));
 const track=el('div','av-ov-meter-track'),fill=el('div','av-ov-meter-fill');
 fill.style.width=(percent(value,total)??0).toFixed(1)+'%';
 fill.style.background=color;track.append(fill);item.append(heading,track);host.append(item);
}
function safeRender(element,render,model){
 try{render(element,model);}
 catch{element.replaceChildren(el('p','av-ov-unavailable','The supplied scenario is not available for this view.'));}
}
/**
 * Interactive illustration-grade dashboard composed from the existing renderers.
 * All scenario numbers retain unverified provenance; this module performs no API calls.
 * Returns a cleanup function to release the animated factory canvas when switching views.
 */
export function renderIllustratedOverview(host,scenario,{navigate}={}){
 if(typeof navigate!=='function')throw Error('A navigation callback is required');
 const stats=deriveVisualOverview(scenario),synthetic=stats.sourceClass==='SYNTHETIC_DEMO';
 host.replaceChildren();
 const shell=el('div','av-overview-shell');
 const mast=el('div','av-overview-command'),copy=el('div','av-overview-command-copy');
 copy.append(el('p','av-ov-eyebrow','INTELLIGENCE SYSTEM  /  VISUAL COMMAND'),
  el('h2',undefined,'Mission control'),
  el('p',undefined,'One interactive view of your hypothetical material network, factory layout, risk signals, economics, and plan.'));
 const actions=el('div','av-overview-command-actions');
 actions.append(chip(synthetic?'SYNTHETIC_DEMO':'USER_SUPPLIED_UNVERIFIED','warning'),chip('NOT LIVE TELEMETRY','muted'));
 const primary=button('Explore process flow ↗','sankey',navigate);
 primary.classList.add('av-ov-action--prominent');
 actions.append(primary);mast.append(copy,actions);shell.append(mast);
 const notice=el('div','av-overview-trust');
 notice.append(el('span','av-overview-trust-icon','i'),
  el('p',undefined,'Illustrated scenario dashboard — all values are '+(synthetic?'synthetic examples':'user supplied and unverified')+'. No posted accounting, factory telemetry, real customer pipeline, approved schedule, or qualified predictions are represented.'));
 shell.append(notice);

 const metrics=el('section','av-overview-kpis');
 metrics.setAttribute('aria-label','Hypothetical scenario key performance indicators');
 metrics.append(
  metric('INBOUND MATERIAL',stats.entryFlow,stats.flowUnit+' · scenario entry quantity',stats.entryFlow>0?100:null,'#56b9e8'),
  metric('DISPATCH FLOW',stats.dispatchFlow,'Scenario delivery node only',percent(stats.dispatchFlow,stats.entryFlow),'#46d5bb'),
  metric('SCRAP & REJECTS',stats.scrapFlow,'Scenario loss pathways',percent(stats.scrapFlow,stats.entryFlow),'#f29c7d'),
  metric('FACTORY STATIONS',stats.stationCount,stats.simulatedRunning+' simulated running; not sensors',null,'#c6a3ef')
 );
 shell.append(metrics);

 const dashboard=el('div','av-overview-dashboard');
 const sankey=card('av-ov-card--flow','MATERIAL TRACEABILITY','Supply-chain flow','Receiving → Stores → Manufacturing → Quality → Dispatch','sankey',navigate);
 sankey.heading.append(chip(stats.networkNodes+' nodes / '+stats.networkLinks+' paths','info'));
 safeRender(sankey.chart,renderSankey,scenario.sankey);
 dashboard.append(sankey.node);

 const signals=card('av-ov-card--signals','OPERATIONAL INTELLIGENCE','Flow assurance','Illustrative throughput and exception distribution','sankey',navigate);
 const overviewSignals=el('div','av-overview-signals'),gauge=el('div','av-overview-gauge');
 gauge.style.setProperty('--gauge-value',(stats.dispatchRate??0)+'%');
 gauge.append(el('strong',undefined,stats.dispatchRate===null?'—':fmt(stats.dispatchRate)+'%'),
  el('span',undefined,'Scenario dispatch ratio'));
 const meters=el('div','av-ov-meters');
 meter(meters,'Dispatched volume',stats.dispatchFlow,stats.entryFlow,'#48cbb0');
 meter(meters,'Rejected volume',stats.scrapFlow,stats.entryFlow,'#e99e7c');
 meter(meters,'Simulated active stations',stats.simulatedRunning,stats.stationCount,'#8e9fe9');
 overviewSignals.append(gauge,meters);
 const facts=el('div','av-ov-signal-stats');
 for(const [label,value] of [['Unverified stations',stats.unknownStations],['Simulated faults',stats.simulatedFault],['Unknown chart cells',stats.missingCells]]){
  const item=el('div');item.append(el('span',undefined,label),el('strong',undefined,fmt(value)));facts.append(item);
 }
 overviewSignals.append(facts);signals.chart.append(overviewSignals);dashboard.append(signals.node);

 const factory=card('av-ov-card--factory','DIGITAL PLANT MODEL','Factory visual twin','Interactive 3D topology · Rotate, zoom and inspect conceptual assets','factory',navigate);
 const factoryMount=el('div','av-overview-factory');factory.chart.append(factoryMount);
 const disposeFactory=mountFactoryTwin(factoryMount,scenario.factory);
 dashboard.append(factory.node);

 const forecast=card('av-ov-card--forecast','SCENARIO INTELLIGENCE','Cash probability fan','P10 / Median / P90 · seeded illustrative assumptions only','simulation',navigate);
 const forecastModel=runMonteCarlo(DEMO_FORECAST);
 safeRender(forecast.chart,renderSimulation,forecastModel);
 dashboard.append(forecast.node);

 const heat=card('av-ov-card--heat','OPERATING CAPACITY','Utilization heatmap','Multi-station intensity matrix · Missing values stay unknown','heatmap',navigate);
 safeRender(heat.chart,renderHeatmap,scenario.heatmap);dashboard.append(heat.node);

 const waterfall=card('av-ov-card--waterfall','FINANCIAL DRIVERS','Scenario contribution','A waterfall decomposition of the supplied illustrative deltas','waterfall',navigate);
 safeRender(waterfall.chart,renderWaterfall,scenario.waterfall);dashboard.append(waterfall.node);

 const funnel=card('av-ov-card--funnel','CUSTOMER INTELLIGENCE','Commercial pipeline','Opportunity conversion through hypothetical CRM stages','funnel',navigate);
 safeRender(funnel.chart,renderFunnel,scenario.funnel);dashboard.append(funnel.node);

 const timeline=card('av-ov-card--timeline','EXECUTION PLANNING','Production roadmap','Gantt-style milestone sequencing from scenario dates','timeline',navigate);
 safeRender(timeline.chart,renderTimeline,scenario.timeline);dashboard.append(timeline.node);
 shell.append(dashboard);
 const footer=el('div','av-overview-footnote');
 footer.append(chip('SOURCE BOUNDARY ENFORCED','info'),
  el('p',undefined,'Explore each card to inspect the full interactive visualization. Visual fidelity does not establish actual data fidelity.'));
 shell.append(footer);host.append(shell);
 return ()=>{disposeFactory?.();};
}
