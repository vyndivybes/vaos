import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCounts, chartSvg} from './dashboard-charts.mjs';

test('count charts reject invented, unknown, negative and non-integer measures', () => {
 const rows=normalizeCounts([{label:'Observed',value:7},{label:'HOLD',value:'HOLD'},
  {label:'Unknown',value:null},{label:'Negative',value:-3},
  {label:'Financial',value:125.5},{label:'Counter',value:'2'},
  {label:'Pending',value:1}]);
 assert.deepEqual(rows,[{label:'Observed',value:7},{label:'Pending',value:1}]);
});
test('three graph types preserve verified totals and escape untrusted labels', () => {
 const rows=normalizeCounts([{label:'<img src=x onerror=alert(1)>',value:3},{label:'Pending',value:2}]);
 for(const kind of ['columns','bars','donut']){
  const svg=chartSvg(rows,kind,'Source observation counts');
  assert.match(svg,/<svg /);assert.match(svg,/role="img"/);assert.match(svg,/Source observation counts/);
  assert.doesNotMatch(svg,/<img/);
  assert.match(svg,/&lt;img/);
 }
 assert.match(chartSvg(rows,'wrong'),/No supported chart/);
});
test('zero counts are real observations while missing measurements are not plotted', () => {
 assert.deepEqual(normalizeCounts([{label:'Zero',value:0},{label:'Missing',value:undefined}]),[{label:'Zero',value:0}]);
 assert.match(chartSvg([], 'bars'),/No independently observed numeric counts/);
});
