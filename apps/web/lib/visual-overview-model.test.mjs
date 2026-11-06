import test from 'node:test';
import assert from 'node:assert/strict';
import {DEMO_VISUAL_SCENARIO} from './advanced-visual-model.mjs';
import {deriveVisualOverview} from './visual-overview-model.mjs';

test('overview derives real quantities only from explicitly supplied scenario links',()=>{
 const summary=deriveVisualOverview(DEMO_VISUAL_SCENARIO);
 assert.equal(summary.sourceClass,'SYNTHETIC_DEMO');
 assert.equal(summary.entryFlow,100);
 assert.equal(summary.dispatchFlow,83);
 assert.equal(summary.scrapFlow,17);
 assert.equal(summary.dispatchRate,83);
 assert.equal(summary.stationCount,7);
 assert.equal(summary.simulatedRunning,3);
 assert.equal(summary.crmLastStage,8);
 assert.equal(summary.timelineTasks,6);
 assert.equal(summary.isObserved,false);
});
test('overview leaves absent dispatch/scrap data unknown and refuses fake authority',()=>{
 const scenario={
  ...DEMO_VISUAL_SCENARIO,sourceClass:'OBSERVED',
  sankey:{nodes:[{id:'a',label:'Entry'},{id:'b',label:'Exit'}],links:[{source:'a',target:'b',value:6}],unit:'units'}
 };
 const summary=deriveVisualOverview(scenario);
 assert.equal(summary.sourceClass,'USER_SUPPLIED_UNVERIFIED');
 assert.equal(summary.entryFlow,6);
 assert.equal(summary.dispatchFlow,null);
 assert.equal(summary.scrapFlow,null);
 assert.equal(summary.dispatchRate,null);
 assert.equal(summary.isObserved,false);
});
test('overview rejects invalid source graphs and keeps missing-data semantics',()=>{
 assert.throws(()=>deriveVisualOverview({...DEMO_VISUAL_SCENARIO,sankey:{nodes:[],links:[]}}));
});
