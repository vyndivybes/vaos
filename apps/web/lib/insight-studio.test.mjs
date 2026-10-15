import test from 'node:test';
import assert from 'node:assert/strict';
import {buildInsightViews,resolveInsightChartKind,insightSummary} from './insight-studio.mjs';

const base={schemaVersion:'VAOS_DATA_AGENT_V1',readOnly:true,actionAuthorized:false,
 sources:[{status:'OBSERVED'}],metrics:[{value:2}],sourceCoverage:{observed:1,requested:2},
 status:'PARTIAL',mode:'DETERMINISTIC_EVIDENCE',chart:{title:'Counts',rows:[
  {label:'finance',value:3},{label:'HOLD',value:null},{label:'stock',value:0}
 ]}};
test('scoped source views never turn unknown into zero or additive finance claims',()=>{
 const views=buildInsightViews(base);
 assert.equal(views.length,1);
 assert.deepEqual(views[0].rows,[{label:'finance',value:3},{label:'stock',value:0}]);
 assert.equal(views[0].additive,false);
 assert.equal(resolveInsightChartKind(views[0],'donut'),'bars');
 assert.deepEqual(insightSummary(base)[0],['Source views available','1 of 2']);
});
test('workforce views page all 16 employees and omit unknown records',()=>{
 const employees=Array.from({length:16},(_,i)=>({
  name:'Employee '+String(i+1).padStart(2,'0'),workTotal:i===0?null:i,
  completed:i===0?null:Math.floor(i/3),blocked:i===0?null:i%3
 }));
 const data={...base,employees,chart:{title:'Work statuses',rows:[
  {label:'Planned',value:8},{label:'Blocked',value:2}]},metrics:[]};
 const views=buildInsightViews(data);
 assert.equal(views[0].additive,true);
 assert.equal(resolveInsightChartKind(views[0],'auto'),'donut');
 const load=views.filter(x=>x.id.startsWith('workTotal-'));
 assert.equal(load.length,2);
 assert.equal(load.flatMap(x=>x.rows).length,15);
 assert.equal(load.flatMap(x=>x.rows).some(x=>x.label==='Employee 01'),false);
 assert.ok(load.every(x=>x.rows.length<=8 && !x.additive));
 assert.equal(resolveInsightChartKind(load[0],'donut'),'bars');
});
test('investigation leads are bounded and not interpreted as causal proof',()=>{
 const report={...base,investigation:{
  schemaVersion:'VAOS_DATA_AGENT_INVESTIGATION_V1',findings:[
   {title:'Mismatch',observedCount:2},{title:'Unknown',observedCount:'HOLD'}
  ]}};
 const view=buildInsightViews(report).find(x=>x.id==='investigation');
 assert.deepEqual(view.rows,[{label:'Mismatch',value:2}]);
 assert.equal(view.additive,false);
 assert.match(view.note,/not incidents/);
});
test('rejects unauthorized or malformed reports and cannot fabricate coverage',()=>{
 for(const report of [null,{...base,actionAuthorized:true},{...base,readOnly:false},
  {...base,sources:null}])assert.deepEqual(buildInsightViews(report),[]);
 assert.deepEqual(insightSummary({...base,sourceCoverage:{observed:2,requested:1}})[0],
  ['Source views available','Unknown']);
});
