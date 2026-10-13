const $=id=>document.getElementById(id);
const workLabels=[['planned','Planned'],['ready','Ready / queued'],['inProgress','In progress'],['completed','Marked completed'],['blocked','Blocked'],['failed','Failed'],['cancelled','Cancelled']];
let latest=null,selection='orchestrator';
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
function renderRoster(data){
 const table=$('wa-roster');table.replaceChildren();
 for(const emp of data.employees){
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
function renderEmployee(){
 if(!latest)return;
 const emp=latest.employees.find(e=>e.id===selection)||latest.employees[0];
 if(!emp)return;
 selection=emp.id;
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
 renderWork(emp);renderAudit(emp);renderRoster(latest);
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
  $('wa-observed').textContent='No validated snapshot';$('wa-ops-status').textContent='Operational evidence unavailable; liveness not certified.';$('wa-totals').replaceChildren();
  $('wa-roster').replaceChildren();$('wa-select').replaceChildren();
  for(const id of ['wa-profile','wa-work','wa-status-bars','wa-trend','wa-kpis','wa-forecast','wa-defects','wa-capa-status','wa-capa-cases','wa-audit','wa-qualification','wa-audit-pages','wa-progress','wa-progress-coverage','wa-reports','wa-report-status'])$(id).replaceChildren();
 }finally{$('wa-refresh').disabled=false;}
}
$('wa-refresh').addEventListener('click',refresh);
$('wa-select').addEventListener('change',event=>{selection=event.target.value;renderEmployee();});
refresh();
