import {workActivityReport,periodBounds} from './lib/workforce-period-report.mjs';
const $=id=>document.getElementById(id);
const workLabels=[['planned','Planned'],['ready','Ready / queued'],['inProgress','In progress'],['completed','Marked completed'],['blocked','Blocked'],['failed','Failed'],['cancelled','Cancelled']];
let latest=null,selection=new URL(globalThis.location?.href||'http://localhost').searchParams.get('employee')||'orchestrator';
let employeeSearch='',selectedChartKind='columns';
function element(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);if(cls)e.className=cls;return e;}
function cell(row,value){const td=element('td',value);row.append(td);return td;}
function display(value){return value===undefined||value===null?'Not evidenced':String(value);}
function time(value){const date=Date.parse(value);return Number.isFinite(date)?new Date(date).toLocaleString():'Not evidenced';}
function bar(host,label,value,max){
 const wrapper=element('div',undefined,'wa-bar-row');
 const caption=element('div',undefined,'wa-bar-label');
 caption.append(element('span',label),element('strong',display(value)));
 const track=element('div',undefined,'wa-track');track.setAttribute('role','img');track.setAttribute('aria-label',label+': '+display(value));
 if(Number.isSafeInteger(value)&&value>=0){
  const fill=element('div',undefined,'wa-fill');fill.style.width=(max>0?Math.round(100*value/max):0)+'%';track.append(fill);
 }
 wrapper.append(caption,track);host.append(wrapper);
}
function counts(host,items){host.replaceChildren();for(const [name,value] of items){const d=element('div',undefined,'wa-stat');d.append(element('small',name),element('strong',display(value)));host.append(d);}}
// Only render counts actually recorded by the read-only workforce authority.
// Missing values are not treated as zero; heartbeats are not runtime certification.
function renderOverview(data){
 const panels=[
  ['wa-overview-work',[
   ['Planned',data.summary.planned],
   ['In progress',data.summary.inProgress],
   ['Marked completed',data.summary.completed],
   ['Blocked',data.summary.blocked],
   ['Failed',data.summary.failed],
  ]],
  ['wa-overview-heartbeat',[
   ['Recent record · 24h',data.operationalReadiness.recentHeartbeatRecords24h],
   ['Stale record',data.operationalReadiness.staleHeartbeatRecords24h],
   ['Missing / invalid',data.operationalReadiness.missingOrInvalidHeartbeats],
  ]],
 ];
 for(const [id,values] of panels){
  const host=$(id);host.replaceChildren();
  const observed=values.filter(([,value])=>Number.isSafeInteger(value)&&value>=0);
  if(!observed.length){
   host.append(element('p','No independently observed counts available. Unknown is not zero.','wa-viz-empty'));
   continue;
  }
  const max=Math.max(1,...observed.map(([,value])=>value));
  for(const [label,value] of observed)bar(host,label,value,max);
  if(observed.length<values.length)host.append(element('p','Some categories have no validated count.','wa-viz-empty'));
 }
}

let periodSelection='all',periodPreset='30';
function periodDay(start,offset){
 return new Date(Date.parse(start+'T00:00:00Z')+offset*86400000).toISOString().slice(0,10);
}
function populatePeriodControls(data){
 const bounds=periodBounds(data.observedAt);
 const from=$('wa-period-from'),to=$('wa-period-to'),select=$('wa-period-employee');
 for(const node of [from,to]){node.min=bounds.min;node.max=bounds.max;}
 const previous=select.value||periodSelection;select.replaceChildren();
 const all=element('option','All 16 employees');all.value='all';select.append(all);
 for(const emp of data.employees){
  const option=element('option',emp.name);option.value=emp.id;select.append(option);
 }
 periodSelection=data.employees.some(x=>x.id===previous)?previous:'all';select.value=periodSelection;
 if(!from.value||from.value<bounds.min||to.value>bounds.max){
  to.value=bounds.max;from.value=periodDay(bounds.max,-29);
 }
 renderPeriod();
}
function evidenceRow(host,title,details,missionId=null){
 const row=element('article',undefined,'wa-period-item');
 row.append(element('strong',title),element('p',details));
 if(missionId&&/^[a-zA-Z0-9][a-zA-Z0-9._:-]{3,95}$/.test(missionId)){
  const a=element('a','Open source mission ↗');
  a.href='/mission-status.html?missionId='+encodeURIComponent(missionId);row.append(a);
 }
 host.append(row);
}
function renderPeriod(){
 if(!latest)return;
 const from=$('wa-period-from').value,to=$('wa-period-to').value;
 for(const id of ['wa-period-kpis','wa-period-work','wa-period-audits','wa-period-reports','wa-period-forecasts'])
  $(id).replaceChildren();
 let report;
 try{report=workActivityReport(latest,{from,to,employeeId:periodSelection});}
 catch{
  $('wa-period-status').textContent='Select a valid period within the latest 90 days of recorded history. Older history is not available from this source.';
  return;
 }
 $('wa-period-status').textContent='Period '+from+' to '+to+
  ' (UTC) · snapshot '+time(report.asOf)+
  '. Task statuses are current recorded values, not historical end-of-day states.';
 counts($('wa-period-kpis'),[
  ['Employees selected',report.employees],['Tasks updated',report.recordedUpdated],
  ['Currently marked completed',report.markedCompleted],['Currently blocked',report.blocked],
  ['Verified employee reports',report.verifiedReports],
  ['Audits reviewed',report.reviewedAudits],['Failed audits',report.auditFailures],
 ]);
 const work=$('wa-period-work');
 for(const x of report.rows) evidenceRow(work,x.employee+' · '+x.description,
  'Recorded status: '+x.status+' · Updated '+time(x.updatedAt)+' · Action '+x.action,x.missionId);
 if(!report.rows.length)work.append(element('p','No recorded work-package updates in the selected period. This does not prove that no work took place.'));
 const audit=$('wa-period-audits');
 for(const x of report.audits) evidenceRow(audit,x.employee+' · '+x.outcome+' · '+x.route,
  'Reviewed '+time(x.reviewedAt)+' by '+x.reviewer+' · Open findings '+x.openFindings+
  '. '+x.rationale);
 if(!report.audits.length)audit.append(element('p','No independently reviewed departmental audit recorded in this period.'));
 const verified=$('wa-period-reports');
 for(const x of report.reports) evidenceRow(verified,x.employee+' · '+x.action.replaceAll('_',' '),
  'Verified '+time(x.verifiedAt)+' by '+x.reviewer+' · Work package '+x.workPackageId);
 if(!report.reports.length)verified.append(element('p','No independently verified employee handoff reports recorded in this period.'));
 const forecasts=$('wa-period-forecasts');
 let qualified=0;
 for(const x of report.forecast){
  const ok=x.status==='INDEPENDENTLY_QUALIFIED_PROJECTION'&&x.projectedFinishAt;
  if(ok)qualified++;
  evidenceRow(forecasts,x.employee+' · '+(ok?'Qualified projection':'Forecast unavailable'),
   ok?'Expected finish '+time(x.projectedFinishAt)+' · Confidence '+x.confidence+
    '. This is a conditional projection, not a guarantee.':
    (x.reason||'No approved dated plan and independently qualified historical forecast.'));
 }
 $('wa-period-forecast-note').textContent=qualified+' of '+report.forecast.length+
  ' selected employees have a current qualified projection. No projected dates are fabricated. '+
  'This section shows existing qualified forecasts rather than creating an unsupported new model.';
}
function selectPeriodPreset(value){
 periodPreset=value;const to=$('wa-period-to'),from=$('wa-period-from');
 if(value==='custom')return renderPeriod();
 if(!latest)return;
 const bounds=periodBounds(latest.observedAt);
 to.value=bounds.max;
 from.value=periodDay(bounds.max,-(Math.min(90,Number(value))-1));
 if(from.value<bounds.min)from.value=bounds.min;
 renderPeriod();
}
$('wa-period-presets').addEventListener('change',event=>selectPeriodPreset(event.target.value));
for(const id of ['wa-period-from','wa-period-to'])$(id).addEventListener('change',()=>{
 $('wa-period-presets').value='custom';periodPreset='custom';renderPeriod();
});
$('wa-period-employee').addEventListener('change',event=>{periodSelection=event.target.value;renderPeriod();});

function renderRoster(data){
 const table=$('wa-roster');table.replaceChildren();
 for(const emp of data.employees){
  if(employeeSearch&&!([emp.name,emp.department,emp.lifecycle,emp.audit.status].join(' ').toLowerCase().includes(employeeSearch)))continue;
  const tr=element('tr');tr.dataset.current=String(emp.id===selection);
  const td=cell(tr,'');const button=element('button',emp.name);button.type='button';
  button.addEventListener('click',()=>{selection=emp.id;$('wa-select').value=selection;renderEmployee();});
  td.append(button);
  cell(tr,emp.lifecycle);cell(tr,display(emp.work.total));
  cell(tr,display(emp.verifiedClosures?.['90d']??null));cell(tr,emp.audit.status);
  const op=data.operationalReadiness?.employees?.find(x=>x.id===emp.id);
  cell(tr,op?.heartbeatStatus==='RECENT_HEARTBEAT_RECORD_ONLY'?'Recent record · runtime unverified':
   op?.heartbeatStatus==='STALE_HEARTBEAT_RECORD'?'Stale heartbeat':op?'No valid heartbeat':'Not evidenced');
  table.append(tr);
 }
}
function renderWork(emp){
 const tbody=$('wa-work');tbody.replaceChildren();
 if(!emp.workItems.length){const tr=element('tr');const td=cell(tr,'No recent work-package records');td.colSpan=3;tbody.append(tr);return;}
 for(const item of emp.workItems){
  const tr=element('tr');cell(tr,display(item.missionId)+' · '+display(item.actionType));
  cell(tr,item.status);cell(tr,time(item.updatedAt));tbody.append(tr);
 }
}
function renderAudit(emp){
 $('wa-qualification').textContent=emp.qualificationAssessment.status==='NOT_RECORDED'
  ?'No qualification assessment on record.'
  :'Qualification assessment: '+emp.qualificationAssessment.status+
   ' · Q'+emp.qualificationAssessment.targetLevel+
   ' · '+time(emp.qualificationAssessment.assessedAt)+
   ' · Assessor: '+display(emp.qualificationAssessment.assessedBy)+
   '. This is NOT a departmental audit pass.';
 $('wa-audit').textContent='Independent audit ledger: '+emp.audit.status+
  '. Recorded route reviews are separate from employee qualification or release certification.';
 const tbody=$('wa-audit-pages');tbody.replaceChildren();
 for(const page of emp.audit.pages){
  const row=element('tr');cell(row,page.route+(page.requiresLedger?' (ledger required)':''));
  const outcome=cell(row,page.status+(page.overdue?' · NEXT AUDIT OVERDUE':''));
  if(page.result){const r=page.result;
   outcome.append(element('p','Executed '+time(r.executedAt)+' · Reviewed '+time(r.reviewedAt)+' by '+r.reviewer),
    element('p','Findings '+r.openFindings+' · Corrective owner '+display(r.correctiveOwner)+' · Next due '+time(r.nextAuditDueAt)),
    element('p','Evidence: '+r.evidenceRefs.join(', ')+' · Source '+r.canonicalSourceRef),element('p',r.rationale));
  }
  tbody.append(row);
 }
 if(emp.audit.history?.length){const row=element('tr');cell(row,'Review history');cell(row,emp.audit.history.map(r=>r.id+' · '+r.outcome+' · '+time(r.reviewedAt)+(r.supersedesId?' · supersedes '+r.supersedesId:'')).join(' / '));tbody.append(row);}
}

function renderEmployeeCharts(emp){
 const root=$('wa-evidence-chart');root.replaceChildren();
 const series=workLabels.map(([key,label])=>({label,value:emp.work[key]}))
  .filter(x=>typeof x.value==='number'&&Number.isSafeInteger(x.value)&&x.value>=0);
 if(!series.length){root.textContent='No validated work-package counts are available. Unknown is not zero.';return;}
 const total=series.reduce((a,x)=>a+x.value,0);
 if(total===0){root.textContent='No work packages recorded in these categories. Other operational activity is not inferred.';return;}
 const maximum=Math.max(1,...series.map(x=>x.value));
 const colors=['#b59b71','#8297a5','#83a596','#b6a7b7','#c89c80','#adbac7','#9bb9b6'];
 if(selectedChartKind==='bars'){for(const x of series)bar(root,x.label,x.value,maximum);return;}
 if(selectedChartKind==='donut'){
  const pieces=[];let a=0;
  series.forEach((x,i)=>{const b=a+x.value/total*100;pieces.push(colors[i]+' '+a+'% '+b+'%');a=b;});
  const ring=element('div',undefined,'wa-chart-donut');
  ring.style.background='conic-gradient('+pieces.join(',')+')';
  ring.setAttribute('role','img');ring.setAttribute('aria-label',series.map(x=>x.label+' '+x.value).join('; '));
  ring.append(element('div',total+' registered work packages','wa-chart-donut-hole'));
  const legend=element('ul',undefined,'wa-chart-legend');
  series.forEach((x,i)=>{const li=element('li',x.label+' · '+x.value);li.style.borderLeft='6px solid '+colors[i];legend.append(li);});
  root.append(ring,legend);return;
 }
 const columns=element('div',undefined,'wa-graph-columns');
 series.forEach((x,i)=>{
  const col=element('div',undefined,'wa-chart-column');
  const track=element('div',undefined,'wa-chart-column-track');
  const fill=element('div',undefined,'wa-chart-column-fill');fill.style.height=(100*x.value/maximum)+'%';fill.style.background=colors[i];track.append(fill);
  col.append(element('strong',x.value),track,element('small',x.label));columns.append(col);
 });
 root.append(columns);
}

const evidenceLabels={INDEPENDENT_AUDIT:'Independent audit not verified',AUDIT_RECORD:'Audit record absent',FORECAST_EVIDENCE:'Forecast evidence missing',OPERATIONAL_REPORT:'Operational report not independently qualified',COMPETENCE_ASSESSMENT:'Competence assessment not qualified'};
const evidenceLabel=code=>evidenceLabels[code]||String(code).replace(/_/g,' ');
function renderEvidencePriorities(data){
 const host=$('wa-evidence-priorities');host.replaceChildren();
 const entries=Array.isArray(data?.evidencePriorities)?data.evidencePriorities:[];
 if(entries.length!==16){host.append(element('p','Evidence priority matrix is missing or incomplete. Employee qualification remains HOLD.'));return;}
 const gaps=new Map();
 for(const x of entries)for(const tag of x.missing||[])gaps.set(tag,(gaps.get(tag)||0)+1);
 counts(host,[['Employees requiring review',entries.filter(x=>x.status==='HOLD').length+'/16'],...([...gaps].sort((a,b)=>b[1]-a[1]).map(([name,n])=>[evidenceLabel(name),n]))]);
}

function workboardRow(host,title,notes,agent=null,url=null){
 const row=element('article',undefined,'wa-action-row');row.dataset.search=[title,...notes].join(' ').toLowerCase();
 row.append(element('strong',title));for(const note of notes)row.append(element('p',note));
 if(typeof url==='string'&&url.startsWith('/mission-status.html?missionId=')&&url.length<150){
  const link=element('a','Review source mission ↗');link.href=url;row.append(link);
 }
 if(agent&&latest?.employees?.some(x=>x.id===agent)){
  const button=element('button','Inspect employee');button.addEventListener('click',()=>{
   selection=agent;$('wa-select').value=selection;renderEmployee();$('employee-title').scrollIntoView?.({block:'start'});
  });row.append(button);
 }
 host.append(row);
}
function filterCommissioningRows(){
 const q=String($('wa-action-search').value||'').trim().toLowerCase();
 for(const id of ['wa-blocked-work','wa-audit-work','wa-capa-work','wa-forecast-work'])
  for(const item of $(id).querySelectorAll('.wa-action-row'))item.hidden=Boolean(q&&!item.dataset.search.includes(q));
}
function renderCommissioningBoard(data){
 for(const id of ['wa-blocked-work','wa-audit-work','wa-capa-work','wa-forecast-work'])$(id).replaceChildren();
 const summary=$('wa-commissioning-totals');summary.replaceChildren();
 const b=data?.commissioningBoard;
 if(!b||b.schemaVersion!=='VAOS_WORKFORCE_EXECUTION_BOARD_V1'||b.actionAuthorized!==false||
  b.releaseHoldOverridden!==false||b.commissioned!==false||
  !Array.isArray(b.blocked?.items)||!Array.isArray(b.audit?.results)||b.audit.results.length!==16||
  !Array.isArray(b.capa?.openCases)||!Array.isArray(b.forecast?.results)||b.forecast.results.length!==16||
  !Array.isArray(b.reporting?.results)||b.reporting.results.length!==16){
  $('wa-commissioning-status').textContent='Commissioning evidence unavailable. No holds may be cleared.';return;
 }
 $('wa-commissioning-status').textContent='Read-only action register. No agent dispatch, release, audit PASS, CAPA closure or forecast certification is inferred.';
 counts(summary,[['Blocked packages',b.blocked.count],['Employees requiring audited scopes',b.audit.employeesWithoutCompleteReviewedScope],
  ['Routes without reviewed PASS',b.audit.outstandingRoutes],['Open CAPA',b.capa.openCases.length],
  ['Forecasts unqualified',b.forecast.employeesWithoutQualifiedForecast],['Employees with historical reports',b.reporting.employeesWithRecordedReports]]);
 const blocked=$('wa-blocked-work');
 for(const x of b.blocked.items)workboardRow(blocked,x.workPackageId+' · '+x.status,
  [x.employeeName+' · '+x.actionType,'Mission: '+display(x.missionId),'Root cause evidence: '+x.blockerReason,'Next: '+x.nextEvidence],x.employeeId,x.missionUrl);
 if(!b.blocked.items.length)blocked.textContent='No blocked packages in this evidence projection; wider operational scope remains unverified.';
 const audit=$('wa-audit-work');
 for(const x of b.audit.results)workboardRow(audit,x.employeeName+' · '+x.verifiedPassedRoutes+'/'+x.requiredRoutes+' reviewed PASS',
  ['Department: '+x.department,'Failures: '+x.failedRoutes+' · Not independently passed: '+x.missingOrPendingRoutes,
   'Routes: '+x.routes.map(p=>p.route+' ['+p.status+']').join(' · '),
   'Checks: '+x.requiredChecks.join(', '),'Next: '+x.nextEvidence],x.employeeId);
 const capas=$('wa-capa-work');
 for(const x of b.capa.openCases)workboardRow(capas,x.id+' · '+x.status,
  ['Employee: '+x.assignedEmployeeId,'Retest: '+x.retestStatus,'Next: '+x.nextEvidence],x.assignedEmployeeId);
 if(!b.capa.openCases.length)capas.textContent='No open cases in the linked source; other defect records remain outside this assessment.';
 const plans=$('wa-forecast-work');
 for(const x of b.forecast.results){
  const r=b.reporting.results.find(y=>y.employeeId===x.employeeId);
  workboardRow(plans,x.employeeName+' · '+x.status,
   ['Approved baselines: '+display(x.approvedBaselineCount),
    'Forecast accepted: '+(x.qualified?'Recorded qualification; check validity':'HOLD'),
    'Forecast evidence: '+x.nextEvidence,'Reports: '+(r?.recordedReports??0)+' · '+(r?.status||'NOT_RECORDED'),
    'Delivery: '+(r?.nextEvidence||'Unknown')+' No outbound delivery certified.'],x.employeeId);
 }
 filterCommissioningRows();
}

function renderEmployee(){
 if(!latest)return;
 const emp=latest.employees.find(e=>e.id===selection)||latest.employees[0];
 if(!emp)return;
 selection=emp.id;
 const gate=$('wa-evidence-priority-detail');gate.replaceChildren();
 const entry=latest.evidencePriorities?.find(x=>x.id===emp.id);
 if(!entry){gate.append(element('p','No independent evidence-priority record for this employee. Qualification HOLD.'));}
 else{
  gate.append(element('strong',entry.status==='HOLD'?'Evidence HOLD · independent review needed':'Records present · independent review still needed'));
  const list=element('ul');for(const missing of entry.missing||[])list.append(element('li',evidenceLabel(missing)));if(!list.children.length)list.append(element('li','No recorded gaps under this limited check; not a certification.'));gate.append(list);
 }
 $('wa-profile').replaceChildren();
 $('wa-profile').append(element('strong',emp.name),element('p','Department: '+display(emp.department)+
  ' · Status: '+emp.lifecycle+' · Qualification: '+(emp.qualificationLevel===null?'not evidenced':'Q'+emp.qualificationLevel)+
  ' · Activity: '+emp.activitySignal),
 element('p','Current assignment: '+display(emp.currentAssignment)),
 element('p','Recorded heartbeat timestamp (NOT independent runtime proof): '+time(emp.lastVerifiedActivityAt)),
 element('p','Operational proof: '+(latest.operationalReadiness?.employees?.find(x=>x.id===emp.id)?.heartbeatStatus||'NOT_CONNECTED')+
  '. PASS assessment and ACTIVE lifecycle do not establish verified execution.'),
 element('p','Qualification drills: '+display(emp.trainingWork?.total)+' total · '+display(emp.trainingWork?.completed)+' marked completed (not operational output)'));
 const bars=$('wa-status-bars');bars.replaceChildren();
 const max=Math.max(1,...workLabels.map(([key])=>emp.work[key]??0));
 for(const [key,label] of workLabels)bar(bars,label,emp.work[key],max);
 const trend=$('wa-trend');trend.replaceChildren();
 if(emp.verifiedClosures===null)trend.textContent='Verified closure history not available.';
 else{
  const maxTrend=Math.max(1,...Object.values(emp.verifiedClosures));
  for(const key of ['7d','30d','90d'])bar(trend,'Trailing '+key,emp.verifiedClosures[key],maxTrend);
 }
 $('wa-kpis').replaceChildren();
 for(const kpi of emp.configuredKpis){
  $('wa-kpis').append(element('li',kpi.replaceAll('_',' ')+' — measured value not connected'));
 }
 const f=emp.forecast;
 $('wa-forecast').textContent=f.status+' · '+f.reason+(f.projectedFinishAt
  ?' · Expected '+time(f.projectedFinishAt)+' · Interval '+time(f.lowerAt)+' to '+time(f.upperAt)+' · Confidence '+Math.round(f.confidence*100)+'% · Sample '+f.sampleSize+' · Capacity '+f.capacityPerDay+'/day · Reviewer '+f.reviewer+' · Valid until '+time(f.expiresAt)
  :'. No projected completion date or confidence interval is claimed.');
 $('wa-progress-coverage').textContent=emp.progress.status+' · Approved baselines: '+display(emp.progress.baselineCount)+' · Overdue within this cohort: '+display(emp.progress.overdue)+'. Actual completion requires independent handoff proof; older history remains outside coverage.';
 const progress=$('wa-progress');progress.replaceChildren();
 const table=element('table');const caption=element('caption','Approved cohort at four weekly checkpoints');table.append(caption);
 const head=element('tr');for(const label of ['As of','Planned','Actual'])head.append(element('th',label));table.append(head);
 for(const i of [8,15,22,29]){const p=emp.progress.series[i];if(!p)continue;const row=element('tr');cell(row,new Date(p.at).toLocaleDateString());cell(row,p.planned);cell(row,p.actual);table.append(row);}
 if(emp.progress.series.length){const scroll=element('div',undefined,'wa-scroll');scroll.append(table);progress.append(scroll);}
 if(emp.progress.baselines?.length){const ul=element('ul');for(const b of emp.progress.baselines)ul.append(element('li',b.workPackageId+' · Start '+time(b.plannedStartAt)+' · Due '+time(b.plannedFinishAt)+' · Dependencies '+(b.dependsOn.join(', ')||'None recorded')+' · Approved by '+b.approvedBy));progress.append(ul);}
 $('wa-defects').textContent=emp.defects.status==='PARTIAL_CAPA_SOURCE'
  ?'Linked CAPA records by employee. This is NOT a complete defect register, severity assessment, or independent closure verification.'
  :'CAPA source unavailable. Defect severity, repair evidence, and retesting are unverified.';
 const cc=$('wa-capa-status');cc.replaceChildren();
 const cases=$('wa-capa-cases');cases.replaceChildren();
 if(emp.defects.status==='PARTIAL_CAPA_SOURCE'){
  const entries=Object.entries(emp.defects.capaByStatus);
  const maxCapa=Math.max(1,...entries.map(e=>e[1]));
  for(const [status,count] of entries)bar(cc,'CAPA '+status,count,maxCapa);
  if(!entries.length)cc.textContent='No CAPA records in this connected register (other defect sources not assessed).';
  for(const item of emp.defects.capaCases)cases.append(element('li',item.id+' · '+item.status+' · '+time(item.openedAt)));
 }
 cases.append(element('li','Retest ledger: '+emp.defects.retests.status));
 for(const r of emp.defects.retests.events)cases.append(element('li',r.capaId+' · '+r.kind+' · '+time(r.occurredAt)+' · Owner '+r.owner+' · Reviewer '+r.reviewer+' · Evidence '+r.evidenceRefs.join(', ')+(r.retestEventId?' · Retest '+r.retestEventId:'')+' · '+r.note));
 $('wa-report-status').textContent=emp.reports.status+' · Founder read-only projection. Report provenance does not imply external delivery.';
 $('wa-reports').replaceChildren();
 for(const r of emp.reports.reports)$('wa-reports').append(element('li',r.actionType+' · Work '+r.workPackageId+' · Handoff '+r.handoffId+' · Author '+r.author+' · Independently verified by '+r.reviewer+' at '+time(r.verifiedAt)+' · Report '+r.id+' · SHA-256 '+r.reportSha256));
 renderWork(emp);renderAudit(emp);renderRoster(latest);renderEmployeeCharts(emp);
}
async function refresh(){
 $('wa-status').textContent='Reading workforce evidence…';$('wa-refresh').disabled=true;
 try{
  const r=await fetch('/api/workforce-analytics',{credentials:'same-origin',cache:'no-store'});
  if(r.status===401){location.assign('/login');return;}
  if(!r.ok)throw Error('NOT_COMMISSIONED');
  const data=(await r.json())?.data;
  if(!data||data.schemaVersion!=='VAOS_FOUNDER_ANALYTICS_V1'||data.actionAuthorized!==false||
    !Array.isArray(data.employees)||data.employees.length!==16)throw Error('INVALID_SOURCE');
  const op=data.operationalReadiness;
  if(!op||op.schemaVersion!=='VAOS_WORKFORCE_OPERATIONAL_EVIDENCE_V1'||
   op.actionAuthorized!==false||op.agentDispatchAuthorized!==false||op.operationalRuntimeCertified!==false||
   !Array.isArray(op.employees)||op.employees.length!==16)
   throw Error('WORKFORCE_OPERATIONAL_EVIDENCE_UNVERIFIED');
  latest=data;
  populatePeriodControls(data);
  if(typeof CustomEvent!=='undefined')document.dispatchEvent?.(new CustomEvent('vaos:workforce-loaded'));
  renderOverview(data);
  renderEvidencePriorities(data);
   renderCommissioningBoard(data);
  $('wa-status').textContent='Read-only workforce evidence loaded; independent live operational certification remains HOLD.';
  $('wa-ops-status').textContent=
   'Operational runtime NOT certified. '+op.recentHeartbeatRecords24h+
   '/16 have a recorded heartbeat within 24 hours. '+op.staleHeartbeatRecords24h+
   ' are stale; '+op.missingOrInvalidHeartbeats+
   ' are missing/invalid. PASS assessments are recorded evidence, not operational launch approval.';
  $('wa-observed').textContent='Observed '+time(data.observedAt)+' · source coverage '+data.dataCoverage;
  counts($('wa-totals'),[['Employees recorded',data.summary.registered+'/16'],
   ['Planned work',data.summary.planned],['In progress',data.summary.inProgress],
   ['Marked completed',data.summary.completed],['Blocked',data.summary.blocked],
   ['Verified closures · 90d',data.summary.verifiedClosures90Days],
   ['Recent heartbeat records · 24h',op.recentHeartbeatRecords24h],
   ['Qualification records marked PASS',op.assessmentsMarkedPass],
   ['Recorded level Q3+',op.atLeastQ3Recorded],
   ['Employees with reviewed departmental audits',op.independentlyAuditedEmployees]]);
  const s=$('wa-select');s.replaceChildren();
  for(const emp of data.employees){const opt=element('option',emp.name);opt.value=emp.id;s.append(opt);}
  if(!data.employees.some(e=>e.id===selection))selection=data.employees[0].id;
  s.value=selection;renderEmployee();
 }catch{
  latest=null;$('wa-status').textContent='Analytics source unavailable or migration uncommissioned. No employee metrics can be inferred.';
  $('wa-period-status').textContent='No authenticated source evidence available; period performance and forecasts cannot be reported.';
  for(const id of ['wa-period-kpis','wa-period-work','wa-period-audits','wa-period-reports','wa-period-forecasts'])$(id).replaceChildren();
  for(const id of ['wa-overview-work','wa-overview-heartbeat'])$(id).replaceChildren();
  $('wa-observed').textContent='No validated snapshot';$('wa-ops-status').textContent='Operational evidence unavailable; liveness not certified.';$('wa-totals').replaceChildren();
  $('wa-roster').replaceChildren();$('wa-select').replaceChildren();$('wa-commissioning-totals').replaceChildren();
  $('wa-commissioning-status').textContent='Source unavailable; no corrective evidence qualified.';
  for(const id of ['wa-blocked-work','wa-audit-work','wa-capa-work','wa-forecast-work'])$(id).replaceChildren();$('wa-evidence-priorities').replaceChildren();$('wa-evidence-priority-detail').replaceChildren();
  for(const id of ['wa-profile','wa-work','wa-status-bars','wa-trend','wa-kpis','wa-forecast','wa-defects','wa-capa-status','wa-capa-cases','wa-audit','wa-qualification','wa-audit-pages','wa-progress','wa-progress-coverage','wa-reports','wa-report-status','wa-evidence-chart'])$(id).replaceChildren();
 }finally{$('wa-refresh').disabled=false;}
}
$('wa-action-search').addEventListener('input',filterCommissioningRows);
$('wa-employee-search').addEventListener('input',event=>{employeeSearch=String(event.target.value||'').trim().toLowerCase();if(latest)renderRoster(latest);});
$('wa-chart-kind').addEventListener('change',event=>{selectedChartKind=event.target.value;if(latest){const emp=latest.employees.find(x=>x.id===selection);if(emp)renderEmployeeCharts(emp);}});
$('wa-refresh').addEventListener('click',refresh);
$('wa-select').addEventListener('change',event=>{selection=event.target.value;renderEmployee();});
refresh();
