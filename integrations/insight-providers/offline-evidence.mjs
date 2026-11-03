// Offline interoperability only. No Apromore SaaS calls or Great Expectations execution.
const SAFE=/^[a-zA-Z0-9][a-zA-Z0-9_. :/-]{0,119}$/;
const HASH=/^[a-fA-F0-9]{64}$/;
function invalid(){const e=new Error('INSIGHT_EVIDENCE_INVALID');e.code='INSIGHT_EVIDENCE_INVALID';e.retryable=false;throw e}
function base(input){
 if(!input||typeof input.tenantId!=='string'||!SAFE.test(input.tenantId)||typeof input.sourceRef!=='string'||!SAFE.test(input.sourceRef)||!HASH.test(input.sourceSha256||''))invalid();
 return Object.freeze({tenantId:input.tenantId,sourceRef:input.sourceRef,sourceSha256:input.sourceSha256.toLowerCase()});
}
function csvCell(value){return '"'+value.replaceAll('"','""')+'"'}
export function exportApromoreEventLog({tenantId,sourceRef,sourceSha256,events}={}){
 const source=base({tenantId,sourceRef,sourceSha256});
 if(!Array.isArray(events)||events.length<1||events.length>500)invalid();
 const rows=['case_id,activity,timestamp'];
 for(const e of events){
  if(!e||typeof e.caseId!=='string'||!SAFE.test(e.caseId)||typeof e.activity!=='string'||!SAFE.test(e.activity)||typeof e.timestamp!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(e.timestamp)||!Number.isFinite(Date.parse(e.timestamp)))invalid();
  rows.push([e.caseId,e.activity,e.timestamp].map(csvCell).join(','));
 }
 return Object.freeze({providerId:'apromore',status:'OFFLINE_EXPORT',format:'csv',csv:rows.join('\n')+'\n',eventsCount:events.length,...source,productionRoutingAuthorized:false,canonicalStateUpdated:false});
}
export function ingestGXValidationEvidence({tenantId,sourceRef,sourceSha256,result}={}){
 const source=base({tenantId,sourceRef,sourceSha256});
 if(typeof result?.success!=='boolean'||!result?.statistics||typeof result.statistics!=='object')invalid();
 const a=result.statistics;
 if(!Number.isInteger(a.evaluated_expectations)||!Number.isInteger(a.successful_expectations)||a.evaluated_expectations<0||a.successful_expectations<0||a.successful_expectations>a.evaluated_expectations)invalid();
 return Object.freeze({providerId:'great-expectations',status:'OBSERVED_UNVERIFIED',success:result.success,evaluatedExpectations:a.evaluated_expectations,successfulExpectations:a.successful_expectations,...source,canonicalStateUpdated:false,verification:Object.freeze({sourceRead:false,independentlyVerified:false,requiresExternalGXRun:true})});
}
