import {normalizeCounts} from './dashboard-charts.mjs';

/** Read-only visual projection of an already authorised VAOS data-agent response.
 * No values are estimated, converted to zero, summed across domains or fetched here.
 */
export function buildInsightViews(report){
 if(report?.schemaVersion!=='VAOS_DATA_AGENT_V1'||report.readOnly!==true||
    report.actionAuthorized!==false||!Array.isArray(report.sources)||
    !Array.isArray(report.metrics))return [];
 const views=[];
 const sourceRows=normalizeCounts(report.chart?.rows);
 if(sourceRows.length)views.push({
  id:'sources',label:Array.isArray(report.employees)?'Recorded task states':'Selected source records',
  title:report.chart?.title||'Observed counts',
  rows:sourceRows,additive:Array.isArray(report.employees),
  note:Array.isArray(report.employees)
   ?'Recorded work-package states only; marked completion is not independently verified.'
   :'Bounded samples of different record types; never sum these as enterprise totals.'
 });
 if(report.investigation?.schemaVersion==='VAOS_DATA_AGENT_INVESTIGATION_V1'){
  const evidence=normalizeCounts((report.investigation.findings||[]).map(f=>({
   label:f.title,value:f.observedCount
  })));
  if(evidence.length)views.push({
   id:'investigation',label:'Investigation leads',
   title:'Selected rows associated with investigation findings',rows:evidence,
   additive:false,
   note:'Finding categories may overlap. Selected row counts are not incidents or confirmed causal explanations.'
  });
 }
 if(Array.isArray(report.employees)){
  for(const [field,label,title] of [
   ['workTotal','Recorded workload','Recorded work packages by employee'],
   ['completed','Marked completed','Recorded completed work packages by employee'],
   ['blocked','Blocked workload','Recorded blocked work packages by employee']
  ]){
   const rows=report.employees.filter(e=>
    e && typeof e.name==='string' && Number.isSafeInteger(e[field]) &&
    e[field]>=0 && e[field]<=1_000_000_000)
    .map(e=>({label:e.name,value:e[field]}))
    .sort((a,b)=>b.value-a.value||a.label.localeCompare(b.label));
   for(let i=0;i<rows.length;i+=8){
    const page=rows.slice(i,i+8);
    views.push({
     id:field+'-'+Math.floor(i/8),label:label+(rows.length>8?' · '+(i+1)+'–'+Math.min(i+8,rows.length):''),
     title,rows:page,additive:false,
     note:'Employee-specific recorded counts; missing employee values are excluded, never shown as zero. '+
      'This is not a competence, utilisation or audit certification.'
    });
   }
  }
 }
 return views;
}

export function resolveInsightChartKind(view,selection='auto'){
 if(!view)return 'bars';
 if(selection==='donut')return view.additive?'donut':'bars';
 if(selection==='columns'||selection==='bars')return selection;
 return view.additive&&view.rows.length<=7?'donut':'bars';
}

export function insightSummary(report){
 const observed=report?.sourceCoverage?.observed;
 const requested=report?.sourceCoverage?.requested;
 const coverage=Number.isSafeInteger(observed)&&Number.isSafeInteger(requested)&&
  observed>=0&&requested>=observed
  ?observed+' of '+requested:'Unknown';
 return [
  ['Source views available',coverage],
  ['Analysis state',typeof report?.status==='string'?report.status:'Unknown'],
  ['Evidence model',report?.mode==='DETERMINISTIC_EVIDENCE'?'Bounded, read-only':'Unverified'],
 ];
}
