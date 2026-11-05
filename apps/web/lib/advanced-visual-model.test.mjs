import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSankey, sankeyLayout, heatmapCells, waterfallSteps, funnelStages,
  timelineBars, routePoints, factoryStationMap, DEMO_VISUAL_SCENARIO
} from './advanced-visual-model.mjs';

test('Sankey computes deterministic, finite, layered non-invented links',()=>{
  const source={nodes:[{id:'raw',label:'Raw'},{id:'wip',label:'Work in progress'},{id:'done',label:'Done'}],links:[{source:'raw',target:'wip',value:12},{source:'wip',target:'done',value:8}],unit:'units'};
  const validated=validateSankey(source);
  assert.equal(validated.links.reduce((s,x)=>s+x.value,0),20);
  const layout=sankeyLayout(source,900,480);
  assert.equal(layout.nodes.length,3);
  assert.equal(layout.links.length,2);
  assert.ok(layout.nodes.find(n=>n.id==='raw').x<layout.nodes.find(n=>n.id==='done').x);
  assert.ok(layout.links.every(l=>l.width>0 && Number.isFinite(l.y1) && Number.isFinite(l.y2)));
  assert.deepEqual(sankeyLayout(source,900,480),layout);
});
test('Sankey rejects unknown IDs, repeated nodes, cycles, NaN, and unsafe flow counts',()=>{
  const normal={nodes:[{id:'a',label:'a'},{id:'b',label:'b'}],links:[{source:'a',target:'b',value:2}]};
  for(const data of [
    {...normal,links:[{source:'a',target:'ghost',value:2}]},
    {...normal,nodes:[{id:'a',label:'a'},{id:'a',label:'again'}]},
    {...normal,links:[{source:'a',target:'b',value:2},{source:'b',target:'a',value:1}]},
    {...normal,links:[{source:'a',target:'b',value:Number.NaN}]},
    {...normal,links:[{source:'a',target:'b',value:-1}]},
    {...normal,links:[{source:'a',target:'b',value:0}]},
  ])assert.throws(()=>validateSankey(data));
});
test('heatmap preserves missing values as null instead of converting to measured zero',()=>{
  const cells=heatmapCells({columns:['Mon','Tue'],rows:[{label:'Line A',values:[0,null]},{label:'Line B',values:[10,3]}]});
  assert.equal(cells.cells[0].value,0);
  assert.equal(cells.cells[1].value,null);
  assert.equal(cells.max,10);
  assert.throws(()=>heatmapCells({columns:['Mon'],rows:[{label:'A',values:['unknown']}]}));
});
test('waterfall preserves signed changes and cumulative sums, not fabricated profit',()=>{
  const result=waterfallSteps({steps:[{label:'Revenue',change:120},{label:'Cost',change:-65},{label:'Expenses',change:-20}]});
  assert.deepEqual(result.steps.map(s=>s.end),[120,55,35]);
  assert.equal(result.total,35);
  assert.throws(()=>waterfallSteps({steps:[{label:'Unknown',change:null}]}));
});
test('funnel makes conversion undefined when denominator is zero and refuses increasing steps',()=>{
  const f=funnelStages({stages:[{label:'Lead',value:100},{label:'Qualified',value:25},{label:'Won',value:0}]});
  assert.equal(f.stages[1].conversionPct,25);
  assert.equal(f.stages[2].conversionPct,0);
  assert.equal(f.stages[0].conversionPct,null);
  assert.throws(()=>funnelStages({stages:[{label:'A',value:10},{label:'B',value:11}]}));
});
test('timeline validates dates and creates proportional positions without assuming actual schedule',()=>{
  const result=timelineBars({tasks:[{label:'Cutting',start:'2026-11-05',end:'2026-11-07'},{label:'QA',start:'2026-11-08',end:'2026-11-10'}]});
  assert.equal(result.tasks.length,2);
  assert.ok(result.tasks[1].leftPct>result.tasks[0].leftPct);
  assert.throws(()=>timelineBars({tasks:[{label:'x',start:'2026-11-10',end:'2026-11-05'}]}));
});
test('logistics projection is a schematic and refuses invalid geographic coordinates',()=>{
  const p=routePoints({points:[{label:'Origin',lat:11.2,lon:76.7},{label:'Destination',lat:12.9,lon:80.3}]});
  assert.equal(p.points.length,2);
  assert.ok(p.points.every(q=>q.x>=0&&q.x<=1&&q.y>=0&&q.y<=1));
  assert.throws(()=>routePoints({points:[{label:'Bad',lat:100,lon:72}]}));
});
test('factory station map validates identities, coordinates and states; no live data is inferred',()=>{
 const result=factoryStationMap({stations:[{id:'qa',label:'QA',x:0,z:0,status:'UNVERIFIED'},{id:'stores',label:'Stores',x:2,z:1,status:'HOLD'}]});
 assert.equal(result.stations[0].status,'UNVERIFIED');
 assert.equal(result.stations[1].status,'HOLD');
 assert.throws(()=>factoryStationMap({stations:[{id:'a',label:'a',x:999,z:1,status:'LIVE'}]}));
});
test('bundled illustration is expressly labeled synthetic and has valid graphs',()=>{
 assert.equal(DEMO_VISUAL_SCENARIO.schemaVersion,'VAOS_VISUAL_SCENARIO_V1');
 assert.equal(DEMO_VISUAL_SCENARIO.sourceClass,'SYNTHETIC_DEMO');
 assert.ok(validateSankey(DEMO_VISUAL_SCENARIO.sankey).links.length>5);
 assert.ok(factoryStationMap(DEMO_VISUAL_SCENARIO.factory).stations.length>=6);
});
