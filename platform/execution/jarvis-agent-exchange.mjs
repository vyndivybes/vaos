import {createSupabaseControlStore} from '../persistence/supabase-store.mjs';
import {createVyndiReadBridgeClient} from './vyndi-read-bridge-client.mjs';
import {resolveDurableControlConfig} from '../../apps/web/lib/durable-control-provider.mjs';
import {buildWorkforceAnalytics} from '../../intelligence/workforce-analytics.mjs';
import {periodForCron,exchangeHistoryKey,exchangeLatestKey,buildExchangeReport} from '../../intelligence/agent-intelligence-exchange.mjs';

const FOUNDER='shyamsundhar1982@gmail.com';
const storeFor=env=>createSupabaseControlStore(resolveDurableControlConfig(env));

export async function readAgentExchangeVaos(env){
  return buildWorkforceAnalytics(await storeFor(env).founderWorkforceOverview(FOUNDER));
}

export async function readAgentExchangeVyndi(env,period){
  if(typeof env?.VYNDI?.fetch!=='function')throw Error('SIGNED_VYNDI_BINDING_UNAVAILABLE');
  const client=createVyndiReadBridgeClient({signer:storeFor(env),serviceBinding:env.VYNDI});
  const response=await client.execute({
    id:crypto.randomUUID(),intentId:crypto.randomUUID(),
    actionType:'ORCHESTRATOR.OBSERVE_ENTERPRISE_BI',
    payload:{missionId:'founder:agent-exchange',from:period.from,to:period.to,
      employeeId:'all',limit:30,offset:0}
  });
  const data=response?.data;
  if(data?.schemaVersion!=='VYNDI_ENTERPRISE_BI_V1'||data.readOnly!==true||
    data.scope!=='all'||data.period?.from!==period.from||
    data.period?.to!==period.to||!Array.isArray(data.departments))
    throw Error('SIGNED_BI_SOURCE_UNQUALIFIED');
  return data;
}

/** A dedicated cron. Never runs missions, procurement or any delegated business write. */
export async function runScheduledAgentExchange({
  env,cron,scheduledTime,readVaos=readAgentExchangeVaos,readVyndi=readAgentExchangeVyndi
}={}){
  const period=periodForCron(cron,scheduledTime);
  if(!period)return {status:'SKIP',reason:'NON_EXCHANGE_CRON'};
  const bucket=env?.VAOS_ARTIFACTS;
  if(typeof bucket?.get!=='function'||typeof bucket?.put!=='function')
    throw Error('EXCHANGE_ARCHIVE_UNAVAILABLE');
  const latestKey=exchangeLatestKey(period.kind);
  const existing=await bucket.get(latestKey);
  if(existing){
    let recorded;
    try{recorded=JSON.parse(await existing.text());}catch{throw Error('EXCHANGE_ARCHIVE_UNVERIFIED');}
    if(recorded?.schemaVersion!=='VAOS_AGENT_EXCHANGE_V1'||
      typeof recorded.period?.date!=='string'||
      !/^\d{4}-\d{2}-\d{2}$/.test(recorded.period.date))throw Error('EXCHANGE_ARCHIVE_UNVERIFIED');
    if(recorded.period.date>=period.date)return {status:'ALREADY_ARCHIVED',
      period:period.kind,date:period.date,sourceStatus:'PREVIOUSLY_RECORDED'};
  }
  const [vaos,vyndi]=await Promise.allSettled([
    readVaos(env,period),readVyndi(env,period),
  ]);
  const report=buildExchangeReport({
    period,
    observedAt:new Date(scheduledTime).toISOString(),
    vaos:vaos.status==='fulfilled'?vaos.value:null,
    vyndi:vyndi.status==='fulfilled'?vyndi.value:null,
  });
  const payload=JSON.stringify(report);
  const metadata={httpMetadata:{contentType:'application/json'}};
  // Save date-specific evidence before publishing the latest pointer.
  await bucket.put(exchangeHistoryKey(period),payload,metadata);
  await bucket.put(latestKey,payload,metadata);
  return {status:report.summary.heldAgents?'HOLD':'OBSERVED',
    period:period.kind,date:period.date,
    observedAgents:report.summary.observedAgents,
    heldAgents:report.summary.heldAgents,
    sourceStatus:{vaos:report.sources.vaos.status,vyndi:report.sources.vyndi.status},
    agentAuthored:false,semanticMemoryUpdated:false,productionWriteAuthorized:false};
}
