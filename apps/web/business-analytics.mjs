import {DEPARTMENT_EMPLOYEES,summarizeDepartments} from './lib/business-department-summary.mjs';
const $=id=>document.getElementById(id);
let batch=0;
const text=(tag,value)=>{const e=document.createElement(tag);e.textContent=String(value);return e;};
function draw(rows){
 const host=$('wa-business-departments');host.replaceChildren();
 const counts=rows.filter(x=>x.datedRecords!==null).map(x=>x.datedRecords);
 const max=Math.max(1,...counts);
 for(const row of rows){
  const card=text('article','');card.className='wa-period-card';
  const heading=text('h3',row.label);card.append(heading);
  const info=text('p',row.state==='NOT_CONNECTED'?'Source unavailable · no actuals claimed':row.state==='PARTIAL'?'Partial bounded source sample':'Bounded source sample');
  card.append(info);
  const value=text('strong',row.datedRecords===null?'Not available':String(row.datedRecords)+' dated records');card.append(value);
  if(row.datedRecords!==null){
   const track=text('div','');track.className='wa-track';track.setAttribute('role','img');track.setAttribute('aria-label',row.label+': '+row.datedRecords+' sampled dated records');
   const fill=text('div','');fill.className='wa-fill';fill.style.width=(100*row.datedRecords/max)+'%';track.append(fill);card.append(track);
   card.append(text('p','Current undated observations: '+row.currentUndated));
  }
  const btn=text('button','View employee and department ↗');btn.type='button';
  btn.addEventListener('click',()=>{
   const select=$('wa-period-employee');select.value=row.employeeId;
   select.dispatchEvent(new Event('change',{bubbles:true}));
   $('wa-vyndi-title').scrollIntoView({behavior:'smooth',block:'start'});
  });card.append(btn);host.append(card);
 }
}
async function refreshBusiness(){
 const ticket=++batch,button=$('wa-business-refresh');
 const from=$('wa-period-from').value,to=$('wa-period-to').value;
 if(!from||!to||from>to){$('wa-business-status').textContent='Select a valid reporting period above.';return;}
 button.disabled=true;$('wa-business-status').textContent='Reading signed departmental snapshots…';
 const accepted=[];
 let unavailable=0;
 // Sequential calls limit pressure on signed bridge and prelaunch free-tier services.
 for(const item of DEPARTMENT_EMPLOYEES){
  if(ticket!==batch)return;
  try{
   const params=new URLSearchParams({employee:item.employeeId,from,to});
   const response=await fetch('/api/vyndi-department-report?'+params,{credentials:'same-origin',cache:'no-store'});
   if(response.status===401){location.assign('/login');return;}
   if(!response.ok){unavailable++;continue;}
   const data=(await response.json()).data;
   if(data?.schemaVersion!=='VAOS_VYNDI_DEPARTMENT_REPORT_V1'||
      data.employeeId!==item.employeeId||data.readOnly!==true)throw Error('INVALID_SOURCE');
   accepted.push(data);
  }catch{unavailable++;}
 }
 if(ticket!==batch)return;
 draw(summarizeDepartments(accepted));
 $('wa-business-status').textContent=accepted.length+' of 8 departmental sources responded; '+unavailable+
 ' unavailable. Charts show dated record counts in a bounded source sample, NOT turnover, profit, production quantity or departmental efficiency. Financial KPIs require posted and reconciled ledger amounts.';
 button.disabled=false;
}
$('wa-business-refresh').addEventListener('click',refreshBusiness);
for(const id of ['wa-period-from','wa-period-to','wa-period-presets'])$(id).addEventListener('change',()=>{if($('wa-period-from').value&&$('wa-period-to').value)refreshBusiness();});
document.addEventListener('vaos:workforce-loaded',refreshBusiness);
draw(summarizeDepartments());
