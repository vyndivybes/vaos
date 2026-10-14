import {VAOS_JOB_CATALOG,VAOS_WORKFORCE_AGENT_IDS,VAOS_WORKFORCE_QUALIFICATION_FLOOR} from '../platform/runtime/vaos-eight-operating-model.mjs';

// Startup preparation uses declared plans and observed system records. It never
// turns development fixtures into company transactions or a design release.
export const STARTUP_ROLES=Object.freeze({
 orchestrator:{title:'Company startup work plan',domain:null,first:'ORCHESTRATOR.DECOMPOSE_MISSION',fields:['objective','owner','prerequisites','proposedDueDate'],steps:['Route startup work to the existing sixteen roles','Retain missing inputs and engineering holds','Consolidate source-linked drafts for the founder']},
 project:{title:'Startup action register',domain:null,first:'PROJECT.CREATE_WORK_PACKAGE',fields:['task','owner','dependency','proposedDueDate','completionEvidence'],steps:['Create preparation work packages','Separate proposed dates from approved milestones','Track completion only when its output exists']},
 vibpe:{title:'Proposed engineering review',domain:'engineering',first:'ENGINEERING.ASSESS_REQUIREMENT',fields:['requirementRef','proposedRevision','units','assumptions','verificationMethod'],steps:['Use the controlling VEDM proposal and cited methods','List geometry, material and analysis assumptions','Prepare the analysis inputs; do not report a solver result without one']},
 qa:{title:'Inspection and nonconformance preparation',domain:'engineering',first:'QA.AUDIT_EVIDENCE',fields:['itemRef','inspectionStage','criteriaRef','measuredResult','disposition','evidenceRef'],steps:['Index the proposed inspection criteria','Keep actual measurements blank until inspection','Record defects and corrective action without self-approving closure']},
 risk:{title:'Startup risk and dependency register',domain:null,first:'RISK.IDENTIFY',fields:['riskDescription','sourceRef','affectedTask','owner','proposedMitigation','acceptedRiskDecision'],steps:['Identify unavailable sources and missing prerequisites','Describe exposure without invented probability or severity','Prepare mitigations and retain affected-action holds']},
 security:{title:'Access and recovery preparation',domain:null,first:'SECURITY.ASSESS_CHANGE',fields:['role','requiredAccess','approver','revocationProcedure','recoveryContact'],steps:['Review role access against the current workforce register','Keep credentials out of reports and model inputs','Prepare access expiry, revocation and recovery steps']},
 knowledge:{title:'Startup source index',domain:'engineering',first:'KNOWLEDGE.BUILD_CONTEXT',fields:['sourceRef','revision','authority','effectiveDate','supersedes'],steps:['Index available sources and exact revisions','Distinguish proposed, released and unavailable evidence','Retain conflicts without inventing missing documents']},
 release:{title:'Action-specific readiness summary',domain:'engineering',first:'RELEASE.CHECK_OPEN_ITEMS',fields:['action','requiredInput','sourceRef','openItem','releaseAuthority'],steps:['Separate software availability from manufacturing release','List conditions for the particular proposed action','Prepare the handover without issuing a production release']},
 commercial:{title:'First lead and quotation worksheet',domain:'commercial',first:'COMMERCIAL.OBSERVE_PIPELINE',fields:['customer','contact','productVariant','proposedQuantity','quotedPrice','currency','sourceRef'],steps:['Prepare the first lead or quotation from supplied information','Leave unknown customer, quantity and price fields blank','Use VYNDI Commercial for the controlled first-record save']},
 procurement:{title:'Supplier and quotation comparison',domain:'procurement',first:'PROCUREMENT.OBSERVE_SHORTAGE',fields:['item','grade','quantity','unit','supplier','quoteAmount','currency','leadTime','sourceRef'],steps:['Use proposed BOM/material requirements for planning','Compare actual quotes only when supplied','Prepare a purchase draft without issuing a purchase order']},
 inventory:{title:'Opening inventory worksheet',domain:'inventory',first:'INVENTORY.OBSERVE_STOCK',fields:['item','lot','unit','verifiedOpeningQuantity','location','sourceRef'],steps:['Prepare item, unit and lot traceability fields','Leave opening stock unknown until physically recorded','Keep sample stock separate from real opening balances']},
 production:{title:'Prototype build preparation',domain:'production',first:'PRODUCTION.OBSERVE_WIP',fields:['model','variant','proposedQuantity','bomRevision','engineeringRelease','materialAvailability','qualityGate'],steps:['Prepare the prototype job and required inputs','Use proposed engineering data for planning only','Release or advance a build only through its existing controlled workflow']},
 maintenance:{title:'First asset and maintenance worksheet',domain:'maintenance',first:'MAINTENANCE.OBSERVE_ASSET',fields:['asset','serial','location','inspectionInterval','serviceabilityEvidence','nextDueDate'],steps:['Prepare the initial asset register','Set maintenance intervals from actual equipment instructions','Retain return-to-service approval until its evidence exists']},
 finance:{title:'Opening budget and funds worksheet',domain:'finance',first:'FINANCE.OBSERVE_LEDGER',fields:['category','proposedAmountINR','fundSource','quoteRef','approvedCommitment','actualPaymentRef'],steps:['Separate proposed budget from actual expenditure','Keep missing amounts and opening cash blank','Prepare payments for the existing approval path; do not pay or post entries']},
 people:{title:'Initial staffing and administration worksheet',domain:'people',first:'PEOPLE.OBSERVE_WORKFORCE',fields:['role','engagementType','proposedStart','approvedCompensation','attendanceEvidence'],steps:['Prepare required roles without inventing employees','Keep personnel and payroll data restricted','Record actual attendance and approved compensation when operations start']},
 'engineering-configuration':{title:'Proposed configuration worksheet',domain:'engineering',first:'ENGINEERING.OBSERVE_CONFIGURATION',fields:['model','variant','proposedRevision','bomRef','effectivity','releaseDecision'],steps:['Index the VEDM proposed revision and its source','Track configuration changes and effectivity','Do not infer release from a baseline label or a model answer']},
});

export function prelaunchRoster(snapshot){
 const rows=snapshot?.workforce?.digitalEmployees;
 if(!Array.isArray(rows)||rows.length!==16||new Set(rows.map(r=>r?.id)).size!==16||rows.some(r=>!VAOS_WORKFORCE_AGENT_IDS.includes(r?.id)))throw Error('PRELAUNCH_ROSTER_INVALID');
 return VAOS_WORKFORCE_AGENT_IDS.map(id=>{
  const e=rows.find(r=>r.id===id),role=STARTUP_ROLES[id];
  return {id,name:e.name||id,status:e.status,qualificationLevel:e.qualificationLevel,
   roleFloorMet:e.status==='ACTIVE'&&Number.isInteger(e.qualificationLevel)&&e.qualificationLevel>=VAOS_WORKFORCE_QUALIFICATION_FLOOR[id],
   recordedAssessment:e.latestAssessment?{status:e.latestAssessment.status,scope:e.latestAssessment.scope,targetLevel:e.latestAssessment.targetLevel}:null,
   title:role.title,firstAction:role.first,jobs:VAOS_JOB_CATALOG[id].map(j=>({actionType:j.actionType,mode:j.executionMode,humanApprovalRequired:j.humanApprovalRequired,preparationAvailable:true,businessEffectExecuted:false}))};
 });
}

export function createPrelaunchDraft({employeeId,actionType,objective,inputs={},observation=null,engineering=null}){
 const role=STARTUP_ROLES[employeeId],job=VAOS_JOB_CATALOG[employeeId]?.find(j=>j.actionType===actionType);
 if(!role||!job)throw Error('PRELAUNCH_JOB_UNKNOWN');
 if(role.domain!=='engineering')engineering=null;
 if(typeof objective!=='string'||objective.trim().length<5||objective.length>500||/[\x00-\x1f\x7f]/.test(objective)||/\b(password|private key|api key|access token|client secret)\b/i.test(objective))throw Error('PRELAUNCH_OBJECTIVE_INVALID');
 if(!inputs||typeof inputs!=='object'||Array.isArray(inputs)||Object.entries(inputs).some(([k,v])=>!role.fields.includes(k)||v!==null&&(typeof v==='string'?v.length>500||/[\x00-\x1f\x7f]/.test(v):typeof v==='number'?!Number.isFinite(v)||v<0:typeof v!=='boolean')))throw Error('PRELAUNCH_INPUT_INVALID');
 const source=observation?.status==='OBSERVED'?{domain:role.domain,status:observation.count===0?'EMPTY_LEDGER':'PRELAUNCH_RECORDS',selectedRecords:observation.count,authority:observation.authority}:role.domain?{domain:role.domain,status:'SOURCE_UNAVAILABLE',selectedRecords:null}:null;
 const sources=[...(source?[source]:[]),...(engineering?.sources||[]).map(s=>({repository:s.repository,path:s.path,revision:s.sha,url:s.url,status:'PROPOSED_ENGINEERING_CONTEXT'}))];
 const worksheet=Object.fromEntries(role.fields.map(field=>[field,inputs[field]??null]));
 return {schemaVersion:'VAOS_PRELAUNCH_DRAFT_V1',employeeId,actionType,objective:objective.trim(),
  title:role.title+' — '+actionType.split('.').slice(1).join(' ').replaceAll('_',' ').toLowerCase(),
  status:'DRAFT_PREPARED',operatingPhase:'PRELAUNCH',worksheet,steps:[...role.steps],
  sourceState:source?.status||'WORKFORCE_REGISTER',sources,
  engineeringSummary:engineering?.answer?.slice(0,3400)||null,
  missingInputs:role.fields.filter(field=>worksheet[field]===null||worksheet[field]===''),actionControls:{catalogMode:job.executionMode,approvalRequired:job.humanApprovalRequired,
   scope:'STARTUP_WORKSHEET_AND_ACTION_PLAN_ONLY',businessEffectExecuted:false,engineeringReleaseGranted:false},
  notice:'Prepared startup worksheet, not completed departmental business execution. Historical performance is not required; unknown quantities stay blank. Existing development rows are not certified company transactions.'};
}

export function calculateStartupScenario(input){
 const keys=['units','unitCostINR','unitPriceINR','fixedCostsINR','openingFundsINR'];
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==keys.length||keys.some(k=>!Object.hasOwn(input,k)))throw Error('STARTUP_SCENARIO_INPUT_INVALID');
 if(!Number.isSafeInteger(input.units)||input.units<0||input.units>1000000)throw Error('STARTUP_SCENARIO_INPUT_INVALID');
 const paise=k=>{const x=input[k];if(typeof x!=='number'||!Number.isFinite(x)||x<0||x>1000000000||Math.abs(Math.round(x*100)-x*100)>0.00001)throw Error('STARTUP_SCENARIO_INPUT_INVALID');return Math.round(x*100);};
 const cost=paise('unitCostINR'),price=paise('unitPriceINR'),fixed=paise('fixedCostsINR'),opening=paise('openingFundsINR');
 const required=input.units*cost+fixed,revenue=input.units*price;
 if(!Number.isSafeInteger(required)||!Number.isSafeInteger(revenue))throw Error('STARTUP_SCENARIO_INPUT_INVALID');
 return {schemaVersion:'VAOS_STARTUP_SCENARIO_V1',classification:'FOUNDER_SUPPLIED_PROPOSAL',currency:'INR',units:input.units,
  proposedCostINR:required/100,proposedRevenueINR:revenue/100,proposedMarginINR:(revenue-required)/100,
  proposedFundingGapINR:Math.max(0,required-opening)/100,
  assumptions:'All units sold at the entered price; entered unit and fixed costs only. Taxes, timing, yield, capacity and payment collection are not inferred.',
  actualRevenueVerified:false,forecastQualified:false,actionAuthorized:false};
}

export function startupBatch({snapshot,objective,observations={},engineering=null}){
 const roster=prelaunchRoster(snapshot);
 if(roster.some(r=>!r.roleFloorMet))throw Error('PRELAUNCH_ROLE_NOT_AVAILABLE');
 return roster.map(r=>createPrelaunchDraft({employeeId:r.id,actionType:r.firstAction,objective,
  observation:observations[STARTUP_ROLES[r.id].domain],engineering}));
}
