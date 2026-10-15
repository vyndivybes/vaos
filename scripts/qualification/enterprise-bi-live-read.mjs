// Explicit manual release acceptance. Read-only business requests; existing
// signer and replay protection remain in force. Never log records or secrets.
import assert from 'node:assert/strict';
import {createVyndiReadBridgeClient} from '../../platform/execution/vyndi-read-bridge-client.mjs';
import {createSupabaseControlStore} from '../../platform/persistence/supabase-store.mjs';
import {buildWorkforceAnalytics} from '../../intelligence/workforce-analytics.mjs';
import {workActivityReport} from '../../apps/web/lib/workforce-period-report.mjs';

const expected=process.env.EXPECTED_VYNDI_SHA;
assert.match(expected||'',/^[a-f0-9]{40}$/);
const healthResponse=await fetch('https://vyndios.vayushastr.workers.dev/api/runtime/health');
const health=await healthResponse.json();
assert.equal(healthResponse.ok,true);assert.equal(health.sourceSha,expected);
assert.equal(health.ok,true);assert.equal(health.pendingMigrationCount,0);
const signer=createSupabaseControlStore({url:'https://jjzycduoujbmiegqfiud.supabase.co',serverSecret:process.env.VAOS_DB_RPC_SECRET});
const client=createVyndiReadBridgeClient({signer,serviceBinding:{fetch(url,options){
 assert.equal(url,'https://vyndi.service/api/vaos/bridge');
 return fetch('https://vyndios.vayushastr.workers.dev/api/vaos/bridge',options);
}}});
const to=new Date().toISOString().slice(0,10);
const from=new Date(Date.parse(to)-29*86400000).toISOString().slice(0,10);
async function read(employeeId,from,to,extra={}){
 const evidence=await client.execute({id:crypto.randomUUID(),intentId:crypto.randomUUID(),
  actionType:'ORCHESTRATOR.OBSERVE_ENTERPRISE_BI',
  payload:{missionId:'read-only:bi-release-acceptance',employeeId,from,to,limit:1,...extra}});
 const data=evidence.data;
 assert.equal(data.schemaVersion,'VYNDI_ENTERPRISE_BI_V1');assert.equal(data.readOnly,true);
 assert.deepEqual(data.period,{from,to});assert.equal(data.scope,employeeId);
 return data;
}
const current=await read('all',from,to);
assert.equal(current.departments.length,16);
assert.equal(new Set(current.departments.map(x=>x.employeeId)).size,16);
const sources=current.departments.flatMap(d=>d.sources||[]);
assert.equal(sources.length,53);
const missing=sources.filter(x=>x.status!=='OBSERVED').map(x=>x.sourceTable);
console.log(JSON.stringify({stage:'SIGNED_LIVE_SOURCE_COVERAGE',vyndiSha:expected,
 departments:16,sources:53,unavailableSources:missing}));
assert.deepEqual(missing,[],'Governed source queries must all be observed');
const oldTo=new Date(Date.parse(to)-100*86400000).toISOString().slice(0,10);
const oldFrom=new Date(Date.parse(oldTo)-29*86400000).toISOString().slice(0,10);
const historical=await read('commercial',oldFrom,oldTo);
assert.equal(historical.departments[0].isCompleteAggregate,true);
const paged=await read('qa',from,to,{sourceTable:'vyndi_quality_capas',offset:1});
assert.equal(paged.departments[0].sources.find(x=>x.sourceTable==='vyndi_quality_capas').detailPage.offset,1);
assert.equal(paged.departments[0].detailPage.offset,0);
const workforce=buildWorkforceAnalytics(await signer.founderWorkforceOverview('shyamsundhar1982@gmail.com'));
const report=workActivityReport(workforce,{from,to});
assert.equal(workforce.employees.length,16);assert.equal(report.plans.length,16);
const anonymous=await fetch(`https://vaos.vayushastr.workers.dev/api/enterprise-bi?from=${from}&to=${to}`);
assert.equal(anonymous.status,401);
console.log(JSON.stringify({stage:'READ_ONLY_BI_ACCEPTANCE',status:'PASS',
 historicalScope:'SERVER_DATE_FILTERED',specialistPagination:'SCOPED',
 workforceEvidence:'SOURCE_VALIDATED',anonymousAccess:'DENIED',
 authenticatedBrowserAcceptance:'UNVERIFIED'}));
