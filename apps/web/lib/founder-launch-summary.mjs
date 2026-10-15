/**
 * Founder Operational Launch: derive an honest read-only startup brief from
 * the existing persisted PREPARE_ALL run, not synthetic operating activity.
 *
 * Prepared worksheets are plans, never completed departmental operations.
 * No database writes, permissions, autonomous actions or release promotion.
 */
const TRACKS=Object.freeze([
 Object.freeze({id:'coordinate',name:'Company coordination',description:'Organize the startup work, ownership, knowledge and controls.',
  owners:['orchestrator','project','security','knowledge','risk']}),
 Object.freeze({id:'engineering',name:'Engineering and assurance',description:'Prepare proposed VEDM design evidence and open quality gates.',
  owners:['vibpe','engineering-configuration','qa','release']}),
 Object.freeze({id:'business',name:'Commercial and administration',description:'Prepare actual opening records only when authoritative inputs are supplied.',
  owners:['commercial','procurement','inventory','finance','people']}),
 Object.freeze({id:'operations',name:'Prototype and equipment readiness',description:'Prepare build and asset information without releasing production.',
  owners:['production','maintenance']}),
]);
const IDS=TRACKS.flatMap(track=>track.owners);
const SOURCE_STATES=new Set(['PRELAUNCH_RECORDS','EMPTY_LEDGER','SOURCE_UNAVAILABLE','WORKFORCE_REGISTER']);
const BASE=Object.freeze({businessEffectsExecuted:false,canonicalStatus:'NO_EXECUTION_CLAIM'});

export function summarizeFounderLaunch({employees,history,observations}={}){
 const roster=Array.isArray(employees)?employees:[];
 const current=Array.isArray(history)?history:[];
 const sources=observations&&typeof observations==='object'&&!Array.isArray(observations)?observations:{};
 const workforceReady=IDS.filter(id=>roster.some(e=>e?.id===id&&e.roleFloorMet===true)).length;
 const sourceHolds=Object.values(sources).filter(x=>x?.status==='HOLD').length;
 const emptyLedgers=Object.values(sources).filter(x=>x?.status==='OBSERVED'&&x?.count===0).length;
 const team=current.find(run=>run?.operation==='PREPARE_ALL');
 const base={...BASE,workforceReady,sourceHolds,emptyLedgers,recordedDrafts:0,
  sourceUnavailableDrafts:0,preparedAt:null,tracks:[],nextAction:null};
 if(!team)return {...base,status:'NOT_PREPARED'};
 const outputs=team.outputs;
 const valid=team.businessEffectsExecuted===false
  &&typeof team.preparedAt==='string'&&!Number.isNaN(Date.parse(team.preparedAt))
  &&Array.isArray(outputs)&&outputs.length===16
  &&new Set(outputs.map(row=>row?.employeeId)).size===16
  &&outputs.every(row=>IDS.includes(row?.employeeId)&&row.status==='DRAFT_PREPARED'
   &&typeof row.title==='string'&&row.title.length>=3
   &&typeof row.actionType==='string'
   &&SOURCE_STATES.has(row.sourceState)
   &&Array.isArray(row.steps)&&row.steps.length>0
   &&row.steps.every(s=>typeof s==='string'&&s.length>0)
   &&Array.isArray(row.missingInputs)
   &&row.actionControls?.businessEffectExecuted===false
   &&row.actionControls?.scope==='STARTUP_WORKSHEET_AND_ACTION_PLAN_ONLY');
 if(!valid)return {...base,status:'EVIDENCE_INCOMPLETE'};
 const map=new Map(outputs.map(o=>[o.employeeId,o]));
 const tracks=TRACKS.map(t=>({id:t.id,title:t.name,description:t.description,
  roles:t.owners.map(employeeId=>{
   const r=map.get(employeeId),e=roster.find(v=>v?.id===employeeId);
   return {employeeId,owner:e?.name||employeeId,title:r.title,actionType:r.actionType,
    status:'DRAFT_PREPARED',sourceState:r.sourceState,
    nextAction:r.steps[0],steps:r.steps.slice(0,5),
    missingInputCount:r.missingInputs.length,
    roleFloorMet:e?.roleFloorMet===true};
  })}));
 const first=tracks[0].roles[0];
 return {...base,
  status:workforceReady===16?'PREPARATION_RECORDED':'WORKFORCE_HOLD',
  canonicalStatus:'RECORDED_PREPARATION_ONLY',
  recordedDrafts:16,
  preparedAt:team.preparedAt,
  sourceUnavailableDrafts:outputs.filter(r=>r.sourceState==='SOURCE_UNAVAILABLE').length,
  tracks,
  nextAction:first?{employeeId:first.employeeId,description:first.nextAction}:null,
 };
}
