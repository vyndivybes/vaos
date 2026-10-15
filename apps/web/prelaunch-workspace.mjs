import {summarizeFounderLaunch} from './lib/founder-launch-summary.mjs';
const $=id=>document.getElementById(id);let model,busy=false;
const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
async function api(body){const r=await fetch('/api/prelaunch-workforce',{method:body?'POST':'GET',credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});const j=await r.json();if(r.status===401){location.href='/';throw Error('Sign in required');}if(!r.ok)throw Error(j.error?.code||'Startup workspace unavailable');return j.data;}

function launchMetric(label,value,note){
 const card=node('article');card.className='launch-metric';
 const figure=node('strong',String(value));figure.className='launch-value';
 card.append(figure,node('span',label),node('small',note));return card;
}
function renderLaunchBrief(){
 if(!model)return;
 const brief=summarizeFounderLaunch(model),panel=$('launch-brief'),metrics=$('launch-metrics'),tracks=$('launch-tracks');
 panel.hidden=false;metrics.replaceChildren();tracks.replaceChildren();
 const fullyRecorded=brief.status==='PREPARATION_RECORDED';
 $('launch-state').textContent=fullyRecorded
  ?'Saved preparation confirmed · '+new Date(brief.preparedAt).toLocaleString()+'. No departmental business execution or engineering release is claimed.'
  :brief.status==='WORKFORCE_HOLD'
    ?'The saved 16-role batch exists, but at least one current role is below its recorded qualification floor. Do not dispatch that role.'
    :brief.status==='EVIDENCE_INCOMPLETE'
      ?'The saved startup batch is incomplete or its evidence is inconsistent. No launch completion is inferred.'
      :'No saved 16-role startup batch is available yet. Prepare the existing workforce to start.';
 metrics.append(
  launchMetric('Registered roles available',brief.workforceReady+'/16','Current roster; not proof of operational execution'),
  launchMetric('Saved role preparations',brief.recordedDrafts+'/16','Prepared worksheets only'),
  launchMetric('Executed business transactions','0','This startup preparation workflow is read-only'),
  launchMetric('Unavailable source gateways',brief.sourceHolds,'Missing data is not treated as an empty business ledger')
 );
 for(const group of brief.tracks){
  const section=node('details');section.className='launch-track';section.open=group.id==='coordinate';
  const heading=node('summary',group.title+' · '+group.roles.length+' prepared drafts');
  section.append(heading,node('p',group.description));
  const grid=node('div');grid.className='launch-role-grid';
  for(const role of group.roles){
   const article=node('article');article.className='launch-role';
   const name=node('h3',role.title),owner=node('p','Owner · '+role.owner);
   const step=node('p',role.nextAction);step.className='launch-task';
   const source=node('p',role.sourceState==='SOURCE_UNAVAILABLE'
     ?'Source unavailable · verify before using numbers'
     :role.sourceState==='EMPTY_LEDGER'
       ?'Verified empty selected source · first real record still required'
       :role.sourceState==='PRELAUNCH_RECORDS'
         ?'Selected prelaunch records · not qualified operating history'
         :'Workforce register only · no external source read');
   source.className='launch-source';
   const missing=node('small',role.missingInputCount+' proposed input fields not yet supplied');
   article.append(name,owner,step,source,missing);grid.append(article);
  }
  section.append(grid);tracks.append(section);
 }
 $('launch-next').textContent=brief.nextAction
  ?'First proposed preparation · '+brief.nextAction.description+
    '. Review and direct the existing employee through Founder Command; this brief has not dispatched a task.'
  :'There is no source-supported next action to display. No task has been dispatched.';
}
function outputs(runs){
 const out=$('outputs');out.replaceChildren();
 if(!Array.isArray(runs)||!runs.length){out.append(node('p','No saved startup output yet.'));return;}
 for(const run of runs){
  const d=node('details');d.className='result';
  let timestamp='Saved result';try{timestamp=new Date(run.preparedAt).toLocaleString();}catch{}
  d.append(node('summary',timestamp+' · '+(Array.isArray(run.outputs)?run.outputs.length:0)+' saved preparation outputs'));
  for(const item of Array.isArray(run.outputs)?run.outputs:[]){
   const article=node('article');article.className='saved-output';
   article.append(node('h3',item.title||'Proposed budget calculation'));
   if(typeof item.status==='string')article.append(node('p','Recorded: '+item.status+' · not operationally completed'));
   if(Array.isArray(item.steps)&&item.steps.length)article.append(node('p','First suggested action: '+item.steps[0]));
   if(Array.isArray(item.missingInputs))article.append(node('p',item.missingInputs.length+' input fields still unconfirmed'));
   const evidence=node('details');evidence.className='raw-evidence';
   evidence.append(node('summary','Technical source evidence'),node('pre',JSON.stringify(item,null,2)));
   article.append(evidence);d.append(article);
  }
  out.append(d);
 }
}
function employees(){const q=$('search').value.toLowerCase();$('employees').replaceChildren();for(const e of model.employees){if(!(e.name+' '+e.id+' '+e.jobs.map(j=>j.actionType).join(' ')).toLowerCase().includes(q))continue;const card=node('article');card.className='employee';card.append(node('h3',e.name));card.append(node('p',e.title));card.append(node('p',(e.roleFloorMet?'Registered role available':'Role unavailable')+' · Q'+e.qualificationLevel+' · '+e.jobs.length+' preparation actions'));if(e.recordedAssessment)card.append(node('p','Recorded assessment: '+e.recordedAssessment.status+' · '+e.recordedAssessment.scope));const select=node('select');select.setAttribute('aria-label',e.name+' action');for(const job of e.jobs){const option=node('option',job.actionType);option.value=job.actionType;option.selected=job.actionType===e.firstAction;select.append(option);}card.append(select);const button=node('button','Prepare this action');button.type='button';button.disabled=!e.roleFloorMet||busy;button.addEventListener('click',()=>prepare({operation:'PREPARE_EMPLOYEE',employeeId:e.id,actionType:select.value}));card.append(button);$('employees').append(card);}}
async function prepare(extra){if(busy)return;busy=true;$('prepare-all').disabled=true;employees();$('status').textContent='Preparing and saving startup outputs…';try{const run=await api({requestId:crypto.randomUUID(),objective:$('objective').value.trim(),...extra});model.history=[run,...model.history].slice(0,10);outputs(model.history);renderLaunchBrief();$('status').textContent='Saved '+run.outputs.length+' preparation outputs. No business effect was executed.';}catch(e){$('status').textContent=String(e.message);}finally{busy=false;$('prepare-all').disabled=false;employees();}}
async function load(){try{model=await api();$('status').textContent=model.employees.length+' registered employees · '+model.catalogPreparationCount+' catalogued startup preparation actions. Company history is not required.';for(const [name,value]of Object.entries(model.observations)){const e=node('div');e.className='source'+(value.status==='HOLD'?' unavailable':'');e.append(node('strong',name));e.append(node('span',value.status==='HOLD'?'Source unavailable':value.count===0?'Empty ledger — ready for first records':value.count+' selected prelaunch records'));$('sources').append(e);}$('engineering').textContent=model.engineering?.answer||'Proposed engineering source unavailable; worksheets remain available with missing inputs.';for(const s of model.engineering?.sources||[]){const a=node('a',s.path+' · '+s.sha.slice(0,8));a.href=s.url;a.target='_blank';a.rel='noopener';$('engineering-links').append(a);}outputs(model.history);renderLaunchBrief();employees();$('prepare-all').disabled=model.employees.some(e=>!e.roleFloorMet);}catch(e){$('status').textContent=String(e.message);}}
$('search').addEventListener('input',()=>{if(model)employees();});$('prepare-all').addEventListener('click',()=>prepare({operation:'PREPARE_ALL'}));$('scenario').addEventListener('submit',e=>{e.preventDefault();const inputs=Object.fromEntries([...new FormData(e.target)].map(([k,v])=>[k,Number(v)]));prepare({operation:'PLAN_SCENARIO',inputs});});load();
