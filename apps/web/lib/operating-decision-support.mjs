/** Founder decision support on bounded, read-only VAOS observations.
 * A scenario is an assumed pathway, never a certified sales, cash or
 * manufacturing forecast. VEDM owns design authority; VIBPE is advisory.
 */
const DOMAINS=new Set(['finance','commercial','procurement','inventory','production','people']);
const REPO=/^https:\/\/github\.com\/vayu-shastr\/(veloxis-engineering-design-manual|adv-vibpe)\/blob\/[a-f0-9]{40}\/[A-Za-z0-9_./-]+$/i;
const includeEngineering=/\b(performance|risk|operat\w*|strateg\w*|forecast|project\w*|manufactur\w*|production|design|frame|engineer\w*|composite|material|shortage|capacity|supplier)\b/i;
export function shouldIncludeEngineering(question){
 return typeof question==='string'&&includeEngineering.test(question);
}
const formatMonths=(text)=>text;
function sourcesByDomain(observations){
 if(!Array.isArray(observations)||observations.length>6)throw Error('OPERATING_OBSERVATIONS_INVALID');
 const found=new Map();
 for(const item of observations){
  if(!item||!DOMAINS.has(item.domain)||!['HOLD','OBSERVED'].includes(item.status))
   throw Error('OPERATING_OBSERVATIONS_INVALID');
  const count=item.observation?.recordsObserved;
  if(item.status==='OBSERVED'&&(!Number.isSafeInteger(count)||count<0||count>1000))
   throw Error('OPERATING_OBSERVATIONS_INVALID');
  found.set(item.domain,{status:item.status,count:item.status==='OBSERVED'?count:null});
 }
 return found;
}
export function buildOperatingDecisionSupport({question,observations=[],engineering=null}={}){
 if(typeof question!=='string'||question.length<5||question.length>300)
  throw Error('OPERATING_QUESTION_INVALID');
 const by=sourcesByDomain(observations);
 const source=domain=>by.get(domain)||{status:'HOLD',count:null};
 const procurement=source('procurement'),production=source('production'),
  finance=source('finance'),commercial=source('commercial');
 const engineOk=engineering?.status==='OBSERVED'&&engineering?.authorityScope==='VEDM_CURRENT_CONFIGURATION';
 const engineeringState=engineOk?'OBSERVED':'SOURCE_HOLD';
 const technicalSources=engineOk&&Array.isArray(engineering?.sources)
  ?engineering.sources.filter(x=>x&&typeof x.url==='string'&&REPO.test(x.url)
   &&typeof x.repository==='string'&&typeof x.path==='string'
   &&x.url.includes('/'+x.repository+'/blob/')&&x.url.endsWith('/'+x.path)).slice(0,5)
  :[];
 const risks=[
  {code:'MATERIAL_READINESS',title:'Material availability / job readiness',
   severity:procurement.status==='OBSERVED'&&procurement.count>0?'PRIORITY_REVIEW':'DATA_GAP',
   score:procurement.status==='OBSERVED'&&procurement.count>0?100:40,
   evidence:procurement.status==='OBSERVED'
    ?procurement.count+' material shortage lines observed (not distinct blocked jobs or shortage quantities).'
    :'Procurement shortage source unavailable; no zero-shortage assumption.',
   action:'Join shortage lines to approved BOM, reserved inventory and active job cards; rank actual blockers.'},
  {code:'ENGINEERING_RELEASE',title:'Controlled engineering release',
   severity:engineOk?'EVIDENCE_REVIEW':'PRIORITY_REVIEW',score:engineOk?65:90,
   evidence:engineOk?'VEDM authority and VIBPE advisory register retrieved; separate design validation and release still required.'
    :'No combined controlled VEDM authority and VYNDI engineering evidence established in this response.',
   action:'Verify current VEDM baseline, material allowables, FEA, NDT and prototype-release gates before committing builds.'},
  {code:'CASH_VISIBILITY',title:'Cash and procurement exposure',
   severity:'UNQUANTIFIED',score:finance.status==='OBSERVED'?75:60,
   evidence:finance.status==='OBSERVED'
    ?finance.count+' selected finance records observed; this is not verified cash, runway or revenue.'
    :'Finance source unavailable; no cash or runway conclusion possible.',
   action:'Reconcile cash, committed spend and supplier-payment timing; map each purchase to a funded milestone.'},
  {code:'DEMAND_CAPACITY',title:'Order-to-capacity alignment',
   severity:'UNQUANTIFIED',score:commercial.status==='OBSERVED'?70:50,
   evidence:commercial.status==='OBSERVED'
    ?commercial.count+' selected sales orders observed; this does not establish six-month demand.'
    :'Sales-order source unavailable; future demand unverified.',
   action:'Reconcile confirmed orders with engineering-ready capacity and dated supplier lead times.'},
 ];
 risks.sort((a,b)=>b.score-a.score);
 const noObserved=observations.every(x=>x.status!=='OBSERVED');
 const plan=[
  {day:'30',action:'Make one cross-functional shortage/job-card and VEDM gate register; verify finance and order source completeness. Owner: operations + engineering + finance.'},
  {day:'60',action:'Compare supplier alternatives, material qualification, realistic prototype capacity and paid commitments; approve only through existing gates.'},
  {day:'90',action:'Review trial-build evidence, defect/yield results, lead-time variance and available cash; re-baseline the subsequent quarter.'},
 ];
 const supply=procurement.status==='OBSERVED'&&procurement.count>0;
 const engineeringNote=engineOk?'controlled release evidence must still be independently qualified':'VEDM/VIBPE authority and validation must be rechecked';
 const scenarios=[
  {label:'CONSERVATIVE',assumption:'Material or design gates do not clear in time.',periods:[
    {months:'1–2',outcome:'Contain spending, verify '+(supply?'observed shortage lines':'material availability')+' and repair missing evidence.'},
    {months:'3–4',outcome:'Delay dependent prototype steps; qualify alternate supply and revise cost exposure.'},
    {months:'5–6',outcome:'Continue gated validation; no committed ship date without released geometry and materials.'}]},
  {label:'BASELINE',assumption:'Critical dependencies clear sequentially after verification.',periods:[
    {months:'1–2',outcome:'Rank shortages, validate configuration and build a dated two-quarter readiness plan.'},
    {months:'3–4',outcome:'Resolve blockers in priority order; trial production only with approved inputs.'},
    {months:'5–6',outcome:'Evaluate qualification tests and move to next build gate if independently signed off.'}]},
  {label:'OPTIMISTIC',assumption:'Material, cash and validation evidence qualify without rework.',periods:[
    {months:'1–2',outcome:'Close high-priority supplier and '+engineeringNote+' checks early.'},
    {months:'3–4',outcome:'Run controlled prototype learning loop with measured quality and lead-time.'},
    {months:'5–6',outcome:'Make an evidence-backed capacity decision; no assumed revenue or shipment.'}]},
 ];
 const rankText=risks.slice(0,3).map((risk,i)=>(i+1)+'. '+risk.title+' ['+risk.severity+']: '+risk.evidence+' Action: '+risk.action).join(' ');
 const planText=plan.map(p=>'Day '+p.day+': '+p.action).join(' ');
 const scenariosText=scenarios.map(s=>s.label+' (if '+s.assumption.toLowerCase()+') '+
  s.periods.map(p=>'Months '+formatMonths(p.months)+': '+p.outcome).join(' ')).join(' ');
 const kp=engineOk&&Array.isArray(engineering.kpModules)?engineering.kpModules.filter(x=>/^KP-\d{2}$/.test(x)).slice(0,5):[];
 const engineeringText=engineOk?'Controlled VEDM record retrieved, with VIBPE '+(kp.length?kp.join(', ')+' advisory methods':'methods not confirmed')+
  '; this is NOT Co-Pilot solver execution or a design release. Consult the linked commit-pinned source records.':
  'Engineering knowledge unavailable or unqualified. VEDM release and VIBPE analysis cannot be assumed complete.';
 const answer=[
  'RISK RANKING — '+rankText,
  '30/60/90-DAY PLAN — '+planText,
  'SIX-MONTH OPERATING OUTLOOK — Conditional scenarios only; no certified numeric financial or unit forecast. '+scenariosText,
  'ENGINEERING INTELLIGENCE — '+engineeringText,
  'FORECAST INPUTS — Obtain reconciled monthly orders, verified production capacity and yield, qualified material lead times, approved engineering releases, opening cash and payment schedule. Observed row counts do not certify these inputs.'
 ].join('\n\n');
 const spokenAnswer='Top operating risk: '+risks[0].title+'. '+risks[0].evidence+
  ' First: '+risks[0].action+' I have prepared a 30/60/90-day plan and three conditional six-month scenarios; numerical forecasting is not qualified.';
 return {answer,spokenAnswer:spokenAnswer.slice(0,400),risks,plan,scenarios,engineeringState,technicalSources,
  evidenceState:noObserved?'INCOMPLETE':engineeringState==='SOURCE_HOLD'?'PARTIAL':'OBSERVED',
  forecastCertification:'HOLD',forecastType:'QUALITATIVE_CONDITIONAL',actionAuthorized:false,
  readOnly:true,advisoryOnly:true};
}
