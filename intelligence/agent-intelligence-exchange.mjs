import { ORIGINAL_VAOS_AGENT_IDS, VYNDI_OPERATIONAL_AGENT_IDS } from '../platform/runtime/vaos-eight-operating-model.mjs';

export const AGENT_EXCHANGE_CRONS = Object.freeze({
  '30 2 * * *': 'daily',   // 08:00 IST: previous calendar day
  '45 2 * * 1': 'weekly', // Monday 08:15 IST: previous Monday–Sunday
  '0 3 1 * *': 'monthly', // 1st 08:30 IST: previous month
});

const MS_DAY=86400000;
const shiftDay=(day,offset)=>new Date(Date.parse(day+'T00:00:00Z')+offset*MS_DAY).toISOString().slice(0,10);
const cleanStatus=(value)=>typeof value==='string'&&/^[A-Z][A-Z0-9_]{0,39}$/.test(value)?value:'NOT_RECORDED';
const safeCount=(value)=>Number.isSafeInteger(value)&&value>=0&&value<=1000000000?value:null;
const validInstant=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;

export function periodForCron(cron,scheduledTime){
  const kind=AGENT_EXCHANGE_CRONS[cron];
  if(!kind)return null;
  const when=new Date(scheduledTime);
  if(!Number.isFinite(when.getTime()))throw Error('EXCHANGE_SCHEDULE_INVALID');
  // Reports follow the India civil calendar, not the Cloudflare host timezone.
  const day=new Date(when.getTime()+330*60000).toISOString().slice(0,10);
  if(kind==='daily'){
    const prev=shiftDay(day,-1);
    return {kind,from:prev,to:prev,date:day};
  }
  if(kind==='weekly'){
    const previousSunday=shiftDay(day,-1);
    return {kind,from:shiftDay(previousSunday,-6),to:previousSunday,date:day};
  }
  const firstCurrent=day.slice(0,7)+'-01';
  const previousLast=shiftDay(firstCurrent,-1);
  return {kind,from:previousLast.slice(0,7)+'-01',to:previousLast,date:day};
}

export const exchangeLatestKey=kind=>{
  if(!['daily','weekly','monthly'].includes(kind))throw Error('EXCHANGE_PERIOD_INVALID');
  return 'runtime/jarvis-exchange/v1/latest/'+kind+'.json';
};
export const exchangeHistoryKey=period=>{
  if(!['daily','weekly','monthly'].includes(period?.kind)||
    !/^\d{4}-\d{2}-\d{2}$/.test(period?.date||''))throw Error('EXCHANGE_PERIOD_INVALID');
  return 'runtime/jarvis-exchange/v1/'+period.kind+'/'+period.date+'.json';
};

/** Only bounded evidence metadata is archived. No raw CRM, HR, finance, document or chat rows. */
export function buildExchangeReport({period,observedAt,vaos=null,vyndi=null}){
  if(!period||!['daily','weekly','monthly'].includes(period.kind)||
     !validInstant(observedAt))throw Error('EXCHANGE_REPORT_INVALID');
  const vaosVerified=vaos?.schemaVersion==='VAOS_FOUNDER_ANALYTICS_V1'&&
    Array.isArray(vaos.employees)&&validInstant(vaos.observedAt);
  const vyndiVerified=vyndi?.schemaVersion==='VYNDI_ENTERPRISE_BI_V1'&&
    vyndi.readOnly===true&&vyndi.scope==='all'&&
    vyndi.period?.from===period.from&&vyndi.period?.to===period.to&&Array.isArray(vyndi.departments);
  const vaosRecords=new Map((vaosVerified?vaos.employees:[])
    .filter(e=>ORIGINAL_VAOS_AGENT_IDS.includes(e?.id)).map(e=>[e.id,e]));
  const vyndiRecords=new Map((vyndiVerified?vyndi.departments:[])
    .filter(e=>VYNDI_OPERATIONAL_AGENT_IDS.includes(e?.employeeId)).map(e=>[e.employeeId,e]));
  const agents=[
    ...ORIGINAL_VAOS_AGENT_IDS.map(id=>{
      const row=vaosRecords.get(id);
      const present=row?.sourceStatus==='RECORDED';
      return {
        id,system:'VAOS',status:present?'OBSERVED':'HOLD',
        agentAuthored:false,provenance:'SCHEDULED_WORKFORCE_OBSERVATION',
        observedAt:present?validInstant(vaos.observedAt):null,
        sourceAuthority:'VAOS_WORKFORCE_OVERVIEW_V1',
        lifecycle:present?cleanStatus(row.lifecycle):'NOT_OBSERVED',
        work:{total:present?safeCount(row.work?.total):null,
          blocked:present?safeCount(row.work?.blocked):null,
          failed:present?safeCount(row.work?.failed):null},
        shortcoming:present?(safeCount(row.work?.blocked)>0?'BLOCKED_WORK_RECORDED':'AGENT_RUNTIME_NOT_INDEPENDENTLY_VERIFIED'):'WORKFORCE_RECORD_UNAVAILABLE',
        jarvisReceipt:'ARCHIVED_FOR_REVIEW',acknowledged:false,
      };
    }),
    ...VYNDI_OPERATIONAL_AGENT_IDS.map(id=>{
      const row=vyndiRecords.get(id);
      const sourceStatus=cleanStatus(row?.status);
      const observed=Boolean(row)&&!['UNAVAILABLE','HOLD','NOT_RECORDED','UNKNOWN','NOT_OBSERVED','SOURCE_UNAVAILABLE'].includes(sourceStatus);
      return {
        id,system:'VYNDI OS',status:observed?'OBSERVED':'HOLD',
        agentAuthored:false,provenance:'SIGNED_ENTERPRISE_BI_OBSERVATION',
        observedAt:observed?validInstant(observedAt):null,
        sourceAuthority:'ORCHESTRATOR.OBSERVE_ENTERPRISE_BI',
        sourceStatus,work:{total:null,blocked:null,failed:null},
        shortcoming:observed?'AGENT_EXECUTION_NOT_INDEPENDENTLY_VERIFIED':'DEPARTMENT_EVIDENCE_UNAVAILABLE',
        jarvisReceipt:'ARCHIVED_FOR_REVIEW',acknowledged:false,
      };
    })
  ];
  const observedAgents=agents.filter(agent=>agent.status==='OBSERVED').length;
  const heldAgents=agents.length-observedAgents;
  return {
    schemaVersion:'VAOS_AGENT_EXCHANGE_V1',
    period:{...period},generatedAt:validInstant(observedAt),
    reportingMode:'SCHEDULED_OBSERVER_DIGEST_NOT_AGENT_AUTHORED',
    readOnly:true,productionWriteAuthorized:false,
    sources:{
      vaos:{status:vaosVerified?'OBSERVED':'HOLD',authority:'GOVERNED_POSTGRES_WORK_PACKAGES',
        observedAt:vaosVerified?validInstant(vaos.observedAt):null},
      vyndi:{status:vyndiVerified?'OBSERVED':'HOLD',authority:'SIGNED_VYNDI_READ_BRIDGE',
        observedAt:vyndiVerified?validInstant(observedAt):null}
    },
    summary:{registeredSlots:agents.length,observedAgents,heldAgents,
      businessKpisCertified:false,forecastsCertified:false,verifiedLearningImprovements:0},
    agents,
    jarvis:{delivery:'ARCHIVED_FOR_FOUNDER_REVIEW',acknowledgement:'NOT_OBSERVED',
      semanticMemoryUpdated:false,reviewRequired:true,memoryCandidatesPromoted:0,
      cognitiveImprovementVerified:false,multimodalQualified:false,
      note:'Observed source snapshots are not agent-authored messages or evidence of autonomous learning. Semantic memory and cognitive changes require independent verification.'}
  };
}
