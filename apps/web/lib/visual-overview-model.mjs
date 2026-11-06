import {validateSankey,factoryStationMap,heatmapCells,funnelStages,timelineBars} from './advanced-visual-model.mjs';

/**
 * Read-only presentation metrics. Every quantity is derived from explicitly
 * supplied scenario inputs. These summaries cannot assert live source status.
 */
export function deriveVisualOverview(scenario) {
 if(!scenario||scenario.schemaVersion!=='VAOS_VISUAL_SCENARIO_V1')throw Error('Invalid visual scenario');
 const network=validateSankey(scenario.sankey);
 const factory=factoryStationMap(scenario.factory);
 const heatmap=heatmapCells(scenario.heatmap);
 const funnel=funnelStages(scenario.funnel);
 const timeline=timelineBars(scenario.timeline);
 const roots=network.nodes.filter(n=>n.incoming===0);
 const entryFlow=roots.reduce((sum,n)=>sum+n.outgoing,0);
 const inboundTo=id=>network.nodes.some(n=>n.id===id)
  ?network.links.filter(l=>l.target===id).reduce((sum,l)=>sum+l.value,0)
  :null;
 const dispatchFlow=inboundTo('dispatch');
 const scrapFlow=inboundTo('scrap');
 const dispatchRate=dispatchFlow===null||entryFlow<=0?null:Math.round(dispatchFlow/entryFlow*1000)/10;
 const missingCells=heatmap.cells.filter(c=>c.value===null).length;
 const known=heatmap.cells.length-missingCells;
 return Object.freeze({
  sourceClass:scenario.sourceClass==='SYNTHETIC_DEMO'?'SYNTHETIC_DEMO':'USER_SUPPLIED_UNVERIFIED',
  isObserved:false,
  entryFlow, dispatchFlow, scrapFlow, dispatchRate,
  flowUnit:network.unit,networkNodes:network.nodes.length,networkLinks:network.links.length,
  stationCount:factory.stations.length,
  simulatedRunning:factory.stations.filter(s=>s.status==='SIMULATED_RUNNING').length,
  simulatedFault:factory.stations.filter(s=>s.status==='SIMULATED_FAULT').length,
  unknownStations:factory.stations.filter(s=>s.status==='UNVERIFIED').length,
  crmLastStage:funnel.stages.at(-1).value,crmStart:funnel.stages[0].value,
  crmUnit:funnel.unit,
  timelineTasks:timeline.tasks.length,
  missingCells,knownCells:known,
 });
}
