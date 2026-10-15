// Integrated VYNDI OS evidence view in the existing authenticated workforce page.
const $=id=>document.getElementById(id);
const node=(tag,value,cls)=>{const x=document.createElement(tag);if(value!==undefined)x.textContent=String(value);if(cls)x.className=cls;return x};
const components=['wa-vyndi-summary','wa-vyndi-chart','wa-vyndi-coverage','wa-vyndi-records'];
let seq=0,loaded=false;
function clear(){components.forEach(x=>$(x).replaceChildren());}
function line(host,heading,body){
 const c=node('article',undefined,'wa-period-item');
 c.append(node('strong',heading),node('p',body));host.append(c);
}
function valueOf(entry,names){
 for(const key of names){const v=entry.fields.find(f=>f.field.toLowerCase()===key)?.value;
  if(v!==undefined&&v!==null&&String(v).trim())return String(v);}
 return 'Not recorded';
}
function render(payload){
 const summary=$('wa-vyndi-summary');summary.replaceChildren();
 const stats=[
  ['Department',payload.department],
  ['Primary source rows in period',payload.datedRecords],
  ['Current undated observations',payload.undatedCurrentRecords],
  ['Source',payload.sourceAuthority]
 ];
 for(const [label,v] of stats){const card=node('div',undefined,'wa-stat');
 card.append(node('small',label),node('strong',v));summary.append(card);}
 const chart=$('wa-vyndi-chart');chart.replaceChildren();
 if(!payload.statusDistribution.length)chart.append(node('p','No date-qualified business status data in this period.'));
 else{const max=Math.max(...payload.statusDistribution.map(x=>x.count),1);
  for(const {label,count} of payload.statusDistribution){
   const row=node('div',undefined,'wa-bar-row');
   const heading=node('div',undefined,'wa-bar-label');heading.append(node('span',label),node('strong',count));
   const track=node('div',undefined,'wa-track');track.setAttribute('role','img');track.setAttribute('aria-label',label+': '+count);
   const fill=node('div',undefined,'wa-fill');fill.style.width=Math.round(count/max*100)+'%';track.append(fill);
   row.append(heading,track);chart.append(row);
  }
 }
 const coverage=$('wa-vyndi-coverage');coverage.replaceChildren();
 for(const group of payload.groups){
  line(coverage,group.group,
   'Current source rows '+group.sampled+' · dated in period '+group.inPeriod+' · current undated '+group.currentUndated+
   (group.mayBeTruncated?' · More dated rows available in department pages':''));
 }
 for(const note of payload.notes)line(coverage,'Reporting qualification',note);
 const body=$('wa-vyndi-records');body.replaceChildren();
 for(const entry of payload.records){
  const tr=node('tr');
  for(const val of [
   entry.group,entry.date||'Current snapshot only',
   valueOf(entry,['id','sku','sales_order_id','order_id','job_card_id','work_order_id','journal_id','reference','name']),
   valueOf(entry,['status','state','stage','release_disposition']),
   entry.fields.map(x=>x.field+': '+x.value).join(' · ')
  ])tr.append(node('td',val));
  body.append(tr);
 }
 if(!payload.records.length){const tr=node('tr');const td=node('td','No records returned within this bounded source view.');td.colSpan=5;tr.append(td);body.append(tr);}
 $('wa-vyndi-status').textContent='Read-only '+payload.department+
  ' records as of '+new Date(payload.observedAt).toLocaleString()+
  '. Selected dates '+payload.period.from+' to '+payload.period.to+
  '. Full source counts with bounded row previews; current rows are not a complete historical departmental audit.';
}
async function reload(){
 const employee=$('wa-period-employee').value;
 const from=$('wa-period-from').value,to=$('wa-period-to').value;
 const ticket=++seq;clear();
 if(!employee||employee==='all'){
  $('wa-vyndi-status').textContent='Select one of the 16 AI employees above to inspect its department. Consolidated workforce activity remains available above.';
  return;
 }
 if(!from||!to||from>to){$('wa-vyndi-status').textContent='Select a valid reporting period.';return;}
 $('wa-vyndi-status').textContent='Reading signed VYNDI OS departmental authority…';
 try{
  const params=new URLSearchParams({employee,from,to,limit:'30'});
  const res=await fetch('/api/enterprise-bi?'+params,{credentials:'same-origin',cache:'no-store'});
  if(ticket!==seq)return;
  if(!res.ok){
   $('wa-vyndi-status').textContent='VYNDI authoritative read is unavailable or not commissioned (HTTP '+res.status+'). No business metrics inferred.';
   return;
  }
  const data=(await res.json()).data;
  if(ticket!==seq)return;
  const source=data?.departments?.find(x=>x.employeeId===employee);
  if(data?.schemaVersion!=='VYNDI_ENTERPRISE_BI_V1'||data.readOnly!==true||data.scope!==employee||
   data.period?.from!==from||data.period?.to!==to||!source)throw Error('SOURCE_CONTRACT');
  const sources=source.sources||[source];
  const observed=sources.filter(x=>x.status==='OBSERVED');
  if(!observed.length)throw Error('SOURCE_UNAVAILABLE');
  const entries=observed.flatMap(group=>(group.records||[]).map(r=>({group:group.sourceTable,date:r.date,
   fields:Object.entries({...r.fields,status:r.status}).map(([field,value])=>({field,value}))})));
  render({department:source.department,sourceAuthority:'getEnterpriseBusinessIntelligence',
   observedAt:data.observedAt,period:data.period,
   datedRecords:source.periodEventCount??'Unavailable',undatedCurrentRecords:source.undatedCount??'Unavailable',
   records:entries,statusDistribution:(source.statusDistribution||[]).map(x=>({label:x.status,count:x.count})),
   groups:sources.map(x=>({group:x.sourceTable,sampled:x.currentSourceCount??'Unavailable',
    inPeriod:x.periodEventCount??'Unavailable',currentUndated:x.undatedCount??'Unknown',mayBeTruncated:x.detailPage?.hasMore})),
   notes:[...data.interpretation,
    'Coverage '+observed.length+' / '+sources.length+' governed sources. Table rows are bounded previews; full counts are calculated on the server.',
    'Forecast: '+(source.forecast?.reason||'Unavailable. No independently qualified source forecast.'),
    'Business plan comparison: '+source.planVsActual?.reason,
    'Audit: '+source.audit?.reason]});
 }catch{if(ticket===seq){clear();$('wa-vyndi-status').textContent='VYNDI department report unavailable; recorded operations above remain unchanged.';}}
}
for(const id of ['wa-period-employee','wa-period-from','wa-period-to','wa-period-presets'])$(id).addEventListener('change',()=>{
 if(loaded)reload();
});
$('wa-vyndi-refresh').addEventListener('click',()=>reload());
document.addEventListener('vaos:workforce-loaded',()=>{loaded=true;reload();});
