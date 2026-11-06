/** Direct, read-only visualization surface shared with the Advanced Visual Studio.
 * No nested document or iframe. Every chart is synthetic until a source is qualified.
 */
import {DEMO_VISUAL_SCENARIO} from './lib/advanced-visual-model.mjs';
import {renderVisualOverview} from './visual-overview.mjs';
import {
 renderSankey,renderHeatmap,renderWaterfall,renderFunnel,
 renderTimeline,renderLogistics,renderSimulation
} from './advanced-visual-renderers.mjs';
import {mountFactoryTwin} from './factory-twin-view.mjs';
import {runMonteCarlo} from './lib/predictive-simulation.mjs';

export const NATIVE_VISUAL_MODES=Object.freeze([
 'overview','sankey','factory','simulation','heatmap','waterfall','funnel','timeline','logistics'
]);
const sourceStatus=Object.freeze({source:'SYNTHETIC_DEMO',actionAuthorized:false,readOnly:true});
const fields=Object.freeze([
 ['demand','Monthly demand (units)',0,1000000,'any'],
 ['capacity','Monthly capacity (units)',0,1000000,'any'],
 ['price','Selling price per unit',0,1000000000,'any'],
 ['unitCost','Variable cost per unit',0,1000000000,'any'],
 ['fixedCost','Fixed costs per month',0,10000000000,'any'],
 ['openingCash','Opening cash',null,null,'any'],
 ['capex','Monthly capital expenditure',0,10000000000,'any'],
 ['volatilityPct','Demand uncertainty (%)',0,200,'any'],
 ['horizonMonths','Number of months',1,24,'1'],
 ['iterations','Simulation runs',100,5000,'1'],
 ['seed','Reproducible random seed',0,4294967295,'1']
]);
const example=Object.freeze({demand:100,capacity:120,price:2500,unitCost:1700,
 fixedCost:50000,openingCash:200000,capex:10000,volatilityPct:18,
 horizonMonths:12,iterations:1000,seed:42});
const element=(tag,text,className)=>{
 const node=document.createElement(tag);
 if(text!==undefined)node.textContent=String(text);
 if(className)node.className=className;
 return node;
};

function mountSimulation(root,status){
 const panel=element('section',undefined,'vc-simulation-panel');
 const intro=element('p',
  'Enter hypothetical figures to compare possible cash outcomes. No finance data is read, saved or approved.','vc-native-note');
 panel.append(intro);
 const form=element('form',undefined,'vc-simulation-form');
 const grid=element('div',undefined,'vc-simulation-fields');
 for(const [name,title,min,max,step] of fields){
  const label=element('label',title);
  const input=element('input');
  input.name=name;input.type='number';input.required=true;input.step=step;
  if(min!==null)input.min=String(min);
  if(max!==null)input.max=String(max);
  input.placeholder='Enter an assumption';
  label.append(input);grid.append(label);
 }
 form.append(grid);
 const actions=element('div',undefined,'vc-simulation-actions');
 const fill=element('button','Use example values','vc-secondary');
 fill.type='button';
 fill.addEventListener('click',()=>{
  for(const [name,value] of Object.entries(example))
   form.elements.namedItem(name).value=String(value);
  status.textContent='Example assumptions loaded. These are not VAOS business results. Select Run simulation to calculate.';
 });
 const submit=element('button','Run simulation','vc-primary');
 submit.type='submit';actions.append(fill,submit);form.append(actions);
 const output=element('div',undefined,'vc-native-simulation-output av-display');
 form.addEventListener('submit',event=>{
  event.preventDefault();
  const params={};
  for(const [name] of fields){
   const raw=form.elements.namedItem(name)?.value;
   if(!raw?.trim()){
    status.textContent='HOLD — enter each assumption before running the simulation.';
    return;
   }
   params[name]=Number(raw);
  }
  try{
   const simulation=runMonteCarlo(params);
   output.replaceChildren();
   renderSimulation(output,simulation);
   status.textContent='Scenario calculated from '+params.iterations+
    ' simulated paths over '+params.horizonMonths+
    ' months. Not a verified financial forecast; no records were changed.';
  }catch(error){
   status.textContent='HOLD — review the values and try again. '+String(error?.message||'Invalid assumptions.');
  }
 });
 panel.append(form,output);root.append(panel);
}

/** Mount a visual directly into the existing page, keeping one navigation shell. */
export function mountVisualCommandViz(host,id,{onNavigate}={}){
 if(!host||!NATIVE_VISUAL_MODES.includes(id))throw Error('VISUAL_MODE_NOT_AVAILABLE');
 host.replaceChildren();
 const frame=element('div',undefined,'vc-native-view');
 const note=element('p',
  'Illustrative scenario — not a live company dashboard. Open the full workspace to import your own unverified scenario.',
  'vc-native-note');
 const status=element('p',
  'Showing an example. Values are not connected to business records.',
  'vc-native-status');
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 frame.append(note,status);
 const chart=element('div',undefined,'vc-native-canvas av-display');
 frame.append(chart);host.append(frame);
 let dispose=null;
 if(id==='simulation'){
  chart.hidden=true;mountSimulation(frame,status);
 }else{
  try{
   if(id==='overview')renderVisualOverview(chart,DEMO_VISUAL_SCENARIO,{
    provenance:'SYNTHETIC DEMO',onNavigate
   });
   else if(id==='factory')dispose=mountFactoryTwin(chart,DEMO_VISUAL_SCENARIO.factory);
   else {
    const modes={
     sankey:[renderSankey,'sankey'],heatmap:[renderHeatmap,'heatmap'],
     waterfall:[renderWaterfall,'waterfall'],funnel:[renderFunnel,'funnel'],
     timeline:[renderTimeline,'timeline'],logistics:[renderLogistics,'logistics']
    };
    const [render,key]=modes[id]||[];
    if(typeof render!=='function')throw Error('Visualization unavailable');
    render(chart,DEMO_VISUAL_SCENARIO[key]);
   }
  }catch(error){
   chart.replaceChildren();
   status.textContent='HOLD — we could not display this example. Open the full workspace to review the visualization.';
  }
 }
 // This object is never transformed into an execution authorization.
 if(sourceStatus.actionAuthorized!==false)throw Error('VISUAL_AUTHORITY_INVALID');
 return ()=>{if(typeof dispose==='function')dispose();};
}
