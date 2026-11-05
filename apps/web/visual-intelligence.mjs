import {renderVisualOverview} from './visual-overview.mjs';
import {
 DEMO_VISUAL_SCENARIO, validateSankey, heatmapCells, waterfallSteps,
 funnelStages, timelineBars, routePoints, factoryStationMap
} from './lib/advanced-visual-model.mjs';
import {runMonteCarlo} from './lib/predictive-simulation.mjs';
import {
 renderSankey,renderHeatmap,renderWaterfall,renderFunnel,
 renderTimeline,renderLogistics,renderSimulation
} from './advanced-visual-renderers.mjs';
import {mountFactoryTwin} from './factory-twin-view.mjs';

const $=id=>document.getElementById(id);
const tabs=[...document.querySelectorAll('[data-viz]')];
const known=new Set(tabs.map(t=>t.dataset.viz));
const descriptions={
 overview:['Executive intelligence cockpit','Information-dense visual workspace with linked scenario KPIs, Sankey flow, financial drivers, planning and operations.'],
 sankey:['Sankey material-flow diagram','Observe quantities through scenario nodes and transfers without inferring real order or stock movements.'],
 factory:['Factory 3D layout','Rotate and inspect hypothetical manufacturing cells and their simulated states. Not a physical asset digital twin or MES telemetry feed.'],
 simulation:['Monte Carlo cash scenario','Use explicit hypothetical demand, costs, capacity and volatility to calculate probability bands. It is not a certified forecast.'],
 heatmap:['Operational heatmap','Compare scenario utilization measurements; unknowns remain explicitly unavailable.'],
 waterfall:['Financial waterfall','Decompose an illustrative revenue-cost bridge without claiming reconciled ledgers or profit.'],
 funnel:['CRM conversion funnel','Illustrative opportunity stages and conversion; not observed customer pipeline.'],
 timeline:['Production Gantt','Hypothetical planning intervals; tasks are not approved production orders.'],
 logistics:['Logistics coordinate sketch','Show supplied geographic points and straight connections, not delivery routes, location tracking or ETAs.']
};
let current='overview',scenario=DEMO_VISUAL_SCENARIO,source='SYNTHETIC DEMO',factoryDispose=null,simulation=null;

function setProvenance(){
 $('av-provenance').textContent=source;
 $('av-provenance-desc').textContent=source==='SYNTHETIC DEMO'
  ?'Illustration only — not VAOS business actuals.'
  :'User-supplied UNVERIFIED local scenario — not signed enterprise evidence.';
}
function fail(message){$('av-status').textContent='HOLD — '+message;}
function renderCurrent(){
 factoryDispose?.();factoryDispose=null;
 for(const tab of tabs)tab.setAttribute('aria-current',tab.dataset.viz===current?'page':'false');
 const [title,description]=descriptions[current];
 $('av-heading').textContent=title;
 $('av-description').textContent=description;
 $('av-kind').textContent=current==='simulation'?'HYPOTHETICAL DISTRIBUTION':'SCENARIO · '+current.toUpperCase();
 $('av-simulation-controls').hidden=current!=='simulation';
 const host=$('av-display');
 host.replaceChildren();
 try{
  if(current==='overview')renderVisualOverview(host,scenario,{provenance:source,onNavigate:kind=>select(kind)});
   else if(current==='sankey')renderSankey(host,scenario.sankey);
  else if(current==='factory')factoryDispose=mountFactoryTwin(host,scenario.factory);
  else if(current==='heatmap')renderHeatmap(host,scenario.heatmap);
  else if(current==='waterfall')renderWaterfall(host,scenario.waterfall);
  else if(current==='funnel')renderFunnel(host,scenario.funnel);
  else if(current==='timeline')renderTimeline(host,scenario.timeline);
  else if(current==='logistics')renderLogistics(host,scenario.logistics);
  else if(current==='simulation'){
   if(simulation)renderSimulation(host,simulation);
   else {const p=document.createElement('p');p.className='av-placeholder';p.textContent='Enter explicit assumptions and run a reproducible simulation below, or load the labeled illustrative values. No financial result is generated automatically.';host.append(p);}
  }
  $('av-status').textContent=source+' · Graph is generated only from the current scenario. No live source result has been inferred.';
 }catch(error){fail(error?.message||'This scenario cannot be visualized');}
}
function select(kind,{push=true}={}){
 if(!known.has(kind))return;
 current=kind;simulation=null;
 renderCurrent();
 if(push){const url=new URL(location.href);url.searchParams.set('viz',kind);history.replaceState(null,'',url);}
}
function validateImported(obj){
 if(!obj||typeof obj!=='object'||obj.schemaVersion!=='VAOS_VISUAL_SCENARIO_V1')throw Error('Expected schemaVersion VAOS_VISUAL_SCENARIO_V1');
 // Always downgrade external claims to unverified. This browser is NOT an evidence authority.
 for(const field of ['sankey','factory','heatmap','waterfall','funnel','timeline','logistics'])
  if(!Object.hasOwn(obj,field))throw Error('Missing visualization field: '+field);
 validateSankey(obj.sankey);
 factoryStationMap(obj.factory);
 heatmapCells(obj.heatmap);
 waterfallSteps(obj.waterfall);
 funnelStages(obj.funnel);
 timelineBars(obj.timeline);
 routePoints(obj.logistics);
 return {schemaVersion:'VAOS_VISUAL_SCENARIO_V1',sourceClass:'USER_SUPPLIED_UNVERIFIED',
  description:'Local, unverified scenario; not signed source evidence.',
  sankey:obj.sankey,factory:obj.factory,heatmap:obj.heatmap,
  waterfall:obj.waterfall,funnel:obj.funnel,timeline:obj.timeline,logistics:obj.logistics};
}
function importScenario(){
 const text=$('av-json').value;
 if(text.length>85_000)throw Error('Scenario JSON exceeds 85 KB limit');
 const obj=JSON.parse(text);
 const valid=validateImported(obj);
 scenario=valid;simulation=null;source='USER SUPPLIED · UNVERIFIED';
 setProvenance();renderCurrent();
 $('av-import-status').textContent='Scenario accepted locally with unverified provenance. None of its values were written to VAOS.';
}
function exampleAssumptions(){
 const values={demand:100,capacity:120,price:2500,unitCost:1700,fixedCost:50000,
  openingCash:200000,capex:10000,volatilityPct:18,horizonMonths:12,iterations:1000,seed:42};
 for(const [key,value] of Object.entries(values)){
  const input=$('av-simulation-form').elements.namedItem(key);
  if(input)input.value=String(value);
 }
 $('av-status').textContent='Illustrative assumptions loaded. Select Run to calculate a LOCAL scenario (not a financial forecast).';
}
function runScenario(){
 const form=$('av-simulation-form'),names=['demand','capacity','price','unitCost','fixedCost','openingCash','capex','volatilityPct','horizonMonths','iterations','seed'];
 const params={};
 for(const name of names){
  const raw=form.elements.namedItem(name)?.value;
  if(typeof raw!=='string'||!raw.trim())throw Error('Enter '+name+' before calculating a scenario');
  params[name]=Number(raw);
 }
 simulation=runMonteCarlo(params);
 renderSimulation($('av-display'),simulation);
 $('av-status').textContent='SIMULATION ONLY · '+params.iterations+' seeded paths · '+params.horizonMonths+' months. Source is manually entered assumptions; not VAOS ledger actuals.';
}
function businessDay(){
 // VYNDI enterprise read API validates the date in India Standard Time.
 return new Date(Date.now()+5.5*3600*1000).toISOString().slice(0,10);
}
async function checkSources(){
 const status=$('av-source-status'),button=$('av-source-check');
 button.disabled=true;status.textContent='Checking founder-authorized signed source reachability…';
 try{
  const to=businessDay();
  const from=new Date(Date.parse(to+'T00:00:00Z')-30*86_400_000).toISOString().slice(0,10);
  const q=new URLSearchParams({from,to,employee:'all',executive:'1',limit:'5'});
  const response=await fetch('/api/enterprise-bi?'+q,{credentials:'same-origin',cache:'no-store'});
  if(response.status===401){location.assign('/login');return;}
  if(response.status===403){status.textContent='Access denied: founder-only source. Scenario graphics remain unverified.';return;}
  if(!response.ok)throw Error('Authorized source HOLD or unavailable ('+response.status+')');
  const packet=(await response.json()).data;
  if(packet?.schemaVersion!=='VYNDI_ENTERPRISE_BI_V1'||packet.readOnly!==true||
     packet.period?.from!==from||packet.period?.to!==to||!Array.isArray(packet.departments))
     throw Error('Signed source response did not pass the browser contract');
  const observed=packet.departments.filter(p=>p.status==='OBSERVED').length;
  status.textContent='Signed departmental read returned '+observed+' OBSERVED out of '+packet.departments.length+' returned departments for '+from+' to '+to+'. This is SOURCE REACHABILITY only. No machine telemetry, physical inventory, finance or route values were copied into scenario visuals.';
 }catch(error){status.textContent='HOLD — '+(error?.message||'Source qualification unavailable')+'. No visual actuals inferred.';}
 finally{button.disabled=false;}
}
function bind(){
 for(const t of tabs)t.addEventListener('click',()=>select(t.dataset.viz));
 $('av-simulation-form').addEventListener('submit',event=>{
  event.preventDefault();
  try{runScenario();}catch(error){fail(error.message);}
 });
 $('av-load-assumptions').addEventListener('click',exampleAssumptions);
 $('av-apply').addEventListener('click',()=>{try{importScenario();}catch(error){$('av-import-status').textContent='Rejected: '+error.message+'. Previous valid scenario remains unchanged.';}});
 $('av-copy').addEventListener('click',async()=>{
  $('av-json').value=JSON.stringify(scenario,null,2);
  try{await navigator.clipboard.writeText($('av-json').value);$('av-import-status').textContent='Scenario JSON copied; local and unverified.';}
  catch{$('av-json').focus();$('av-json').select();$('av-import-status').textContent='Clipboard unavailable. JSON is selected for manual copying.';}
 });
 $('av-reset').addEventListener('click',()=>{
  scenario=DEMO_VISUAL_SCENARIO;source='SYNTHETIC DEMO';simulation=null;
  $('av-json').value=JSON.stringify(scenario,null,2);
  setProvenance();renderCurrent();$('av-import-status').textContent='Restored synthetic example. No business records changed.';
 });
 $('av-source-check').addEventListener('click',checkSources);
}
async function bootstrap(){
 const sessionStatus=$('av-session-status');
 try{
  const response=await fetch('/api/session',{credentials:'same-origin',cache:'no-store'});
  if(response.status===401){location.replace('/login');return;}
  if(!response.ok)throw Error('Cannot verify VAOS session');
  const result=await response.json();
  if(result?.authenticated!==true)throw Error('Session not authenticated');
  sessionStatus.hidden=true;$('av-main').hidden=false;
  $('av-json').value=JSON.stringify(scenario,null,2);
  setProvenance();bind();
  const kind=new URL(location.href).searchParams.get('viz');
  select(known.has(kind)?kind:'overview',{push:false});
 }catch(error){sessionStatus.textContent='HOLD — '+(error?.message||'Session unavailable')+'. Sign in through VAOS.';}
}
void bootstrap();
