const byId=id=>document.getElementById(id);
const periodButtons=[...document.querySelectorAll('[data-exchange-period]')];
let current='daily';
let sequence=0;
function setText(id,value){byId(id).textContent=String(value??'—');}
function appendText(parent,tag,value,className=''){
  const e=document.createElement(tag);
  if(className)e.className=className;
  e.textContent=String(value??'');
  parent.append(e);
  return e;
}
function emptyState(message,error=false){
  const element=byId('exchange-status');
  element.dataset.state=error?'error':'';
  element.textContent=message;
  for(const id of ['jix-observed','jix-holds','jix-bi','jix-learning','jix-count',
    'jix-vaos-source','jix-vyndi-source'])setText(id,'—');
  setText('jix-memory-status','Not verified');
  setText('jix-cognition','Unverified');
  setText('jix-multimodal','Unverified');
  setText('jix-memory-description','No validated memory change or independent learning comparison is recorded.');
  const rows=byId('jix-agent-rows');rows.replaceChildren();
  const row=rows.insertRow();const cell=row.insertCell();cell.colSpan=3;
  cell.textContent='No verified '+current+' report is available.';
  const timeline=byId('jix-communications');timeline.replaceChildren();
  appendText(timeline,'p','A missing archive is an evidence hold, not a successful report.','jix-muted');
}
function renderReport(report){
  if(report?.schemaVersion!=='VAOS_AGENT_EXCHANGE_V1'||!Array.isArray(report.agents)){
    emptyState('Report validation failed. Source data has not been accepted.',true);return;
  }
  const p=report.period||{};
  const periodLabel=String(p.from||'unknown')+' to '+String(p.to||'unknown');
  byId('exchange-status').dataset.state='';
  setText('exchange-status','Archived '+current+' observer brief · '+periodLabel+' · '+String(report.generatedAt||'timestamp unavailable'));
  setText('jix-observed',report.summary?.observedAgents);
  setText('jix-holds',report.summary?.heldAgents);
  setText('jix-bi',report.summary?.businessKpisCertified===true?'Qualified':'Not qualified');
  setText('jix-learning',report.summary?.verifiedLearningImprovements===0?'0 verified':'Unverified');
  setText('jix-count',report.agents.length+' sources');
  setText('jix-vaos-source',report.sources?.vaos?.status||'HOLD');
  setText('jix-vyndi-source',report.sources?.vyndi?.status||'HOLD');
  setText('jix-memory-status',report.jarvis?.semanticMemoryUpdated?'Requires verification':'Not promoted');
  setText('jix-memory-description',report.jarvis?.note||
    'Source observations are awaiting independent memory review and do not alter the model.');
  setText('jix-cognition',report.jarvis?.cognitiveImprovementVerified===true?'Verified':'Unverified');
  setText('jix-multimodal',report.jarvis?.multimodalQualified===true?'Qualified':'Unverified');
  const tbody=byId('jix-agent-rows');tbody.replaceChildren();
  const timeline=byId('jix-communications');timeline.replaceChildren();
  for(const agent of report.agents){
    const tr=document.createElement('tr');tbody.append(tr);
    const tdName=tr.insertCell();
    appendText(tdName,'span',agent.id);
    appendText(tdName,'small',agent.system+' · '+(agent.agentAuthored?'Agent-authored':'Observer-derived'),'jix-agent-sub');
    const tdStatus=tr.insertCell();
    const state=appendText(tdStatus,'span',agent.status||'HOLD','jix-status');
    if(agent.status==='OBSERVED')state.classList.add('jix-status--observed');
    const tdGap=tr.insertCell();
    tdGap.textContent=String(agent.shortcoming||'SOURCE_NOT_QUALIFIED').replaceAll('_',' ').toLowerCase();
    const note=document.createElement('div');note.className='jix-note';
    appendText(note,'strong',agent.system+' / '+agent.id);
    appendText(note,'p',String(agent.provenance||'UNVERIFIED')+' · '+
      String(agent.status||'HOLD')+' · Receipt: '+String(agent.jarvisReceipt||'NOT_RECORDED'));
    timeline.append(note);
  }
  if(!report.agents.length)appendText(timeline,'p','No agent evidence was archived.','jix-muted');
}
async function loadPeriod(period){
  if(!['daily','weekly','monthly'].includes(period))return;
  current=period;
  const thisSequence=++sequence;
  periodButtons.forEach(button=>{
    const selected=button.dataset.exchangePeriod===period;
    button.classList.toggle('is-current',selected);
    button.setAttribute('aria-pressed',selected?'true':'false');
  });
  setText('exchange-status','Reading '+period+' evidence from the VAOS private archive…');
  try{
    const response=await fetch('/api/agent-exchange?period='+encodeURIComponent(period),{
      credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}
    });
    const payload=await response.json();
    if(thisSequence!==sequence)return;
    if(response.ok){renderReport(payload.data);return;}
    const guidance=response.status===401?'Please sign in to VAOS to access founder reports.'
      :response.status===403?'This intelligence exchange is founder-only.'
      :response.status===404?'No '+period+' report has yet been archived by the scheduled observer.'
      :'Archive unavailable or unverified. '+String(payload.error?.code||'UNKNOWN_ERROR');
    emptyState(guidance,response.status!==404);
  }catch{
    if(thisSequence===sequence)emptyState('The archive could not be reached. No live result can be asserted.',true);
  }
}
periodButtons.forEach(button=>button.addEventListener('click',()=>loadPeriod(button.dataset.exchangePeriod)));
loadPeriod('daily');
