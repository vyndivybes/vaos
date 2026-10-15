// Period analysis of the authenticated 90-day workforce observation.
// Dates of *observed updates* are not historical end-of-day status snapshots.
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const calendar=x=>typeof x==='string'&&DATE.test(x)&&!Number.isNaN(Date.parse(x+'T00:00:00Z'));
const inRange=(stamp,from,to)=>typeof stamp==='string'&&
 Number.isFinite(Date.parse(stamp))&&stamp.slice(0,10)>=from&&stamp.slice(0,10)<=to;
const human=s=>String(s||'').replace(/^[A-Z]+\./,'').replaceAll('_',' ').toLowerCase()
 .replace(/\b\w/g,x=>x.toUpperCase());
export function workActivityReport(data,{from,to,employeeId='all'}){
 if(!calendar(from)||!calendar(to)||from>to)throw Error('INVALID_PERIOD');
 const asOf=data?.observedAt;
 if(!asOf||!Number.isFinite(Date.parse(asOf)))throw Error('NO_AUTHORITY_SNAPSHOT');
 const last=asOf.slice(0,10);
 const oldest=new Date(Date.parse(last+'T00:00:00Z')-89*86400000).toISOString().slice(0,10);
 if(from<oldest||to>last)throw Error('OUTSIDE_OBSERVED_90_DAY_WINDOW');
 const people=(data.employees||[]).filter(x=>employeeId==='all'||x.id===employeeId);
 const rows=[],audits=[],reports=[],forecast=[];
 for(const person of people){
  for(const item of person.workItems||[]){
   if(!inRange(item.updatedAt,from,to))continue;
   rows.push({employeeId:person.id,employee:person.name,id:item.id,
    missionId:item.missionId,action:item.actionType,description:human(item.actionType),
    status:item.status,updatedAt:item.updatedAt,createdAt:item.createdAt});
  }
  for(const review of person.audit?.history||[]){
   if(!inRange(review.reviewedAt,from,to))continue;
   audits.push({employeeId:person.id,employee:person.name,
    route:review.route,outcome:review.outcome,reviewer:review.reviewer,
    reviewedAt:review.reviewedAt,openFindings:review.openFindings,
    rationale:review.rationale,evidenceRefs:review.evidenceRefs});
  }
  for(const report of person.reports?.reports||[]){
   if(!inRange(report.verifiedAt,from,to))continue;
   reports.push({employeeId:person.id,employee:person.name,verifiedAt:report.verifiedAt,
    reviewer:report.reviewer,action:report.actionType,workPackageId:report.workPackageId});
  }
  forecast.push({employeeId:person.id,employee:person.name,...person.forecast});
 }
 rows.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
 audits.sort((a,b)=>b.reviewedAt.localeCompare(a.reviewedAt));
 reports.sort((a,b)=>b.verifiedAt.localeCompare(a.verifiedAt));
 return {from,to,asOf,scope:'RECENT_UPDATES_NOT_HISTORICAL_STATES',
  employees:people.length,
  rows,audits,reports,forecast,
  recordedUpdated:rows.length,markedCompleted:rows.filter(x=>x.status==='COMPLETED').length,
  blocked:rows.filter(x=>x.status==='BLOCKED').length,
  verifiedReports:reports.length,reviewedAudits:audits.length,
  auditFailures:audits.filter(x=>x.outcome==='FAIL').length,
  note:'Task states reflect the latest source snapshot for items last updated in the chosen period. They do not establish what status existed on each past date. Qualification fixtures may be present. Verified employee reports and reviewed audits are separate evidence.'};
}
export function periodBounds(asOf){
 const end=new Date(asOf);
 if(Number.isNaN(end.getTime()))throw Error('INVALID_SOURCE_DATE');
 const to=end.toISOString().slice(0,10);
 return {min:new Date(Date.parse(to+'T00:00:00Z')-89*86400000).toISOString().slice(0,10),max:to};
}
