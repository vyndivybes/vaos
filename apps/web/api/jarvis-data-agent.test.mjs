import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionToken,SESSION_COOKIE} from '../lib/auth.mjs';
import {createJarvisDataAgentHandler} from './jarvis-data-agent.mjs';
import {DEFAULT_API_HANDLERS} from '../cloudflare-worker.mjs';
import {selectDataAgentSources,buildDataAgentReport} from '../lib/data-agent-report.mjs';

function request(q,opts={}){
 const email=opts.email===undefined?'shyamsundhar1982@gmail.com':opts.email;
 return {method:opts.method||'GET',
  url:'https://vaos.example/api/jarvis-data-agent?q='+encodeURIComponent(q),
  headers:{cookie:email?SESSION_COOKIE+'='+createSessionToken(email):''},
  env:{VAOS_VOICE_CONTROL:opts.control===undefined?'founder-readonly-browser-v1':opts.control}};
}
function capture(){
 const x={status:200,body:null,headers:{}};
 const res={setHeader(k,v){x.headers[k]=v;return res},status(n){x.status=n;return res},
 json(v){x.body=v;return res}};
 return {x,res};
}
const makeReader=calls=>({execute:async input=>{
 calls.push(input);
 const mapping={
 'FINANCE.OBSERVE_LEDGER':{authority:'getAccountingWorkbench',data:{ledger:[{id:'private-ledger',balance:900000}],journals:[]}},
 'PROCUREMENT.OBSERVE_SHORTAGE':{authority:'getConfiguredDemandShortages',data:{records:[{id:'secret-material',shortage_quantity:2}]}},
 'PRODUCTION.OBSERVE_WIP':{authority:'getProductionJobCards',data:{records:[]}},
 'COMMERCIAL.OBSERVE_PIPELINE':{authority:'listSalesOrders',data:{records:[]}}
 };
 return {actionType:input.actionType,sourceAuthority:mapping[input.actionType].authority,
 data:mapping[input.actionType].data};
}});
test('data agent route registered in existing Cloudflare router',()=>{
 assert.equal(typeof DEFAULT_API_HANDLERS['/api/jarvis-data-agent'],'function');
});
test('planner is bounded, rejects mutation and identifies the canonical digital workforce',()=>{
 assert.deepEqual(selectDataAgentSources('Analyse our finance and material shortages').domains,
 ['finance','procurement']);
 assert.equal(selectDataAgentSources('Show 16 AI employees performance').workforce,true);
 assert.deepEqual(selectDataAgentSources('Analyze VYNDI company performance').domains,
 ['finance','commercial','procurement','production']);
 assert.equal(selectDataAgentSources('Please approve procurement invoices').status,'DENIED');
 assert.equal(selectDataAgentSources('show me the weather').status,'UNSUPPORTED');
});
test('founder-only and read-only gates stop unauthorized and unbounded requests before any read',async()=>{
 const calls=[];
 const handler=createJarvisDataAgentHandler({getReader:()=>makeReader(calls)});
 for(const [q,opts,status] of [
 ['Analyse finance',{email:''},401],['Analyse finance',{email:'other@domain.test'},401],
 ['Analyse finance',{method:'POST'},405],['Analyse finance',{control:'off'},409],
 ['Delete procurement records',{},422],['Tell me a joke',{},422]
 ]){
  const {x,res}=capture();await handler(request(q,opts),res);assert.equal(x.status,status,q);
 }
 assert.equal(calls.length,0);
});
test('two signed domain observations are returned as separate evidence-backed metrics without PII, money or fake forecasts',async()=>{
 const calls=[],handler=createJarvisDataAgentHandler({
  getReader:()=>makeReader(calls),now:()=>new Date('2026-10-14T16:00:00Z')});
 const {x,res}=capture();
 await handler(request('Analyse finance and procurement shortages'),res);
 assert.equal(x.status,200);
 assert.equal(x.body.data.status,'OBSERVED');
 assert.deepEqual(calls.map(c=>c.actionType),['FINANCE.OBSERVE_LEDGER','PROCUREMENT.OBSERVE_SHORTAGE']);
 assert.ok(calls.every(c=>c.payload.limit===50));
 assert.equal(x.body.data.metrics.length,2);
 assert.deepEqual(x.body.data.metrics.map(x=>x.value),[1,1]);
 assert.ok(x.body.data.answer.includes('[1]')&&x.body.data.answer.includes('[2]'));
 assert.equal(x.body.data.actionAuthorized,false);
 assert.equal(x.body.data.forecastQualified,false);
 assert.equal(x.body.data.modelCalls,0);
 assert.ok(!JSON.stringify(x.body).includes('private-ledger'));
 assert.ok(!JSON.stringify(x.body).includes('900000'));
 assert.ok(!JSON.stringify(x.body).includes('secret-material'));
 assert.equal(x.body.data.sources[0].sourceRevisionVerified,false);
});
test('authority mismatch or invalid source rows become HOLD rather than invented zero totals',async()=>{
 const handler=createJarvisDataAgentHandler({getReader:()=>({execute:async input=>({
  actionType:input.actionType,sourceAuthority:'wrong-authority',data:{records:[{id:'x'}]}
 })})});
 const {x,res}=capture();await handler(request('Inventory and procurement stock review'),res);
 assert.equal(x.status,200);
 assert.equal(x.body.data.status,'HOLD');
 assert.equal(x.body.data.metrics.length,0);
 assert.equal(x.body.data.chart.rows.length,0);
 assert.equal(x.body.data.sources.every(s=>s.status==='HOLD'),true);
});
test('registered workforce count never pretends missing employees are qualified',async()=>{
 const handler=createJarvisDataAgentHandler({getWorkforce:async()=>({
  schemaVersion:'VAOS_WORKFORCE_OVERVIEW_V1',readOnly:true,
  observedAt:'2026-10-14T11:00:00Z',employees:[]})});
 const {x,res}=capture();await handler(request('Show 16 AI employees performance'),res);
 assert.equal(x.status,200);
 assert.equal(x.body.data.status,'PARTIAL');
 assert.equal(x.body.data.employees.length,16);
 assert.equal(x.body.data.metrics[0].value,0);
 assert.equal(x.body.data.employees.every(e=>e.workTotal===null),true);
 assert.match(x.body.data.answer,/0 of 16/);
});
test('metric reporting refuses unqualified values and does not sum incompatible row types',()=>{
 assert.throws(()=>buildDataAgentReport({question:'ok',observations:[
  {domain:'finance',status:'OBSERVED',authority:'source',count:NaN}]}));
 const report=buildDataAgentReport({question:'Counts',observations:[
  {domain:'inventory',status:'OBSERVED',authority:'stock',count:4},
  {domain:'production',status:'HOLD'}],now:'2026-10-14T00:00:00Z'});
 assert.equal(report.status,'PARTIAL');
 assert.deepEqual(report.chart.rows,[{label:'inventory',value:4}]);
 assert.equal(report.sourceCoverage.observed,1);
 assert.equal(report.holds[0],'PRODUCTION_SOURCE_UNAVAILABLE');
});
