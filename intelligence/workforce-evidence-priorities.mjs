// Read-only evidence-gap triage, not employee qualification.
export function evaluateEmployeeEvidencePriorities(input){
 if(!input||input.actionAuthorized===true)throw Error('READ_ONLY_REQUIRED');
 if(!Array.isArray(input.employees)||input.employees.length>16)throw Error('EMPLOYEE_INPUT_INVALID');
 const seen=new Set();
 return input.employees.map(e=>{
  if(!e||typeof e.id!=='string'||!e.id.trim())throw Error('EMPLOYEE_ID_INVALID');
  if(seen.has(e.id))throw Error('DUPLICATE_EMPLOYEE_ID');seen.add(e.id);
  const missing=[];
  if(!e.audit||typeof e.audit.status!=='string')missing.push('AUDIT_RECORD');
  else if(e.audit.status!=='INDEPENDENTLY_VERIFIED')missing.push('INDEPENDENT_AUDIT');
  if(!e.reports||!['INDEPENDENTLY_VERIFIED','QUALIFIED'].includes(e.reports.status))missing.push('OPERATIONAL_REPORT');
  if(!e.forecast||e.forecast.status!=='INDEPENDENTLY_QUALIFIED_PROJECTION')missing.push('FORECAST_EVIDENCE');
  if(!e.qualificationAssessment||e.qualificationAssessment.status!=='QUALIFIED')missing.push('COMPETENCE_ASSESSMENT');
  return Object.freeze({id:e.id,status:missing.length?'HOLD':'EVIDENCE_PRESENT_REVIEW_REQUIRED',missing,authorizedToWrite:false,priority:missing.includes('AUDIT_RECORD')?1:missing.includes('INDEPENDENT_AUDIT')?2:3});
 }).sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id));
}