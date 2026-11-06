/** Browser-side founder case-study controls: rendering only, no imported HTML/JS execution. */
const $=id=>document.getElementById(id);
const API='/api/market-case-studies';
const references=[
 {title:'Realising the Export Potential of India’s Sports Equipment Manufacturing Sector',
  publisher:'NITI Aayog',published:'2026-03-12',kind:'GOVERNMENT',
  url:'https://niti.gov.in/sites/default/files/2026-03/Realising-the-Export-Potential-of-India-Sports-Equipment-Manufacturing-Sector.pdf',
  claim:'NITI Aayog reports a 25–30% aggregate sector-level manufacturing cost disadvantage for Indian sports bicycles against China/Taiwan; this is not a VYNDI frameset cost calculation.'},
 {title:'2025 Market Data for the Bicycle Industry',publisher:'ZIV',published:'2026-03-11',
  kind:'INDUSTRY',url:'https://www.ziv-zweirad.de/wp-content/uploads/2026/03/Market-Data-Bicycle-Industry-2025.pdf',
  claim:'ZIV reports German gravel bicycles represented 10% of conventional bicycle sales in 2025, up from 6.5% in 2024; Germany only.'},
 {title:'ZIV half-year review 2026',publisher:'ZIV',published:'2026-09-07',kind:'INDUSTRY',
  url:'https://www.ziv-zweirad.de/en/2026/09/07/ziv-half-year-review-2026/',
  claim:'ZIV reports German conventional bicycle sales rose almost 10% and production 6% year-on-year in H1 2026; no transfer to India is assumed.'}
];
const internalCaseReferences=Object.freeze({
 'BUSINESS-CASE-001':{
  title:'VYNDI feasibility and landed-BOM research (Case Study 001)',
  publisher:'VYNDI internal management research',published:'2026-11-02',
  kind:'USER_SUPPLIED',
  url:'https://drive.google.com/file/d/13YuMrODnAdUO5nFnjwDfvKm3MAWeteX4/view',
  claim:'Internal feasibility research with five source documents. Prices, BOM and stress assumptions remain unverified and spreadsheet formulas are not independently recalculated.'},
 'BUSINESS-CASE-002':{
  title:'VYNDI capital-disciplined startup pathway (Case Study 002)',
  publisher:'VYNDI internal management research',published:'2026-11-02',
  kind:'USER_SUPPLIED',
  url:'https://drive.google.com/file/d/1VyChHKSkQuEIvuZOi5zEEM79Ky9ofwHC/view',
  claim:'Founder-owned consultancy-first and frameset entry planning study. Financial assumptions are not verified business actuals, signed customers or manufacturing approval.'}
});
let currentReferences=[],generated=null,lastInput=null;
const currency=n=>n==null?'—':new Intl.NumberFormat('en-IN',
 {style:'currency',currency:'INR',maximumFractionDigits:0}).format(n);
const element=(tag,text,className)=>{
 const node=document.createElement(tag);if(text!==undefined)node.textContent=String(text);
 if(className)node.className=className;return node;
};
async function api(url,options){
 const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...options});
 const payload=await response.json().catch(()=>({error:{code:'INVALID_RESPONSE'}}));
 if(!response.ok)throw Error(payload?.error?.code||'VAOS_UNAVAILABLE_'+response.status);
 return payload.data;
}
function showReferences(){
 const host=$('reference-list');host.replaceChildren();
 $('source-count').textContent=currentReferences.length+' SOURCES';
 if(!currentReferences.length){host.append(element('li','No cited evidence selected. Research conclusions remain on HOLD.'));return;}
 for(const source of currentReferences){
  const li=element('li');li.append(element('strong',source.publisher+' · '+source.published));
  const a=element('a',source.title);a.href=source.url;a.target='_blank';a.rel='noopener noreferrer';
  li.append(element('small'));li.lastChild.append(a);
  li.append(element('small',source.claim));host.append(li);
 }
}
function inputs(){
 const form=$('case-form');
 const raw=Object.fromEntries(['sellingPrice','variableCost','monthlyFixedCost','bear','base','bull']
   .map(name=>[name,form.elements.namedItem(name).value.trim()]));
 const count=Object.values(raw).filter(x=>x!=='').length;
 if(count!==0&&count!==6)throw Error('Enter all six financial assumptions, or leave every one blank.');
 const model=count===0?null:{currency:'INR',unit:'framesets',
  sellingPrice:Number(raw.sellingPrice),variableCost:Number(raw.variableCost),
  monthlyFixedCost:Number(raw.monthlyFixedCost),
  monthlyUnits:{bear:Number(raw.bear),base:Number(raw.base),bull:Number(raw.bull)}};
 const stressFields=['cashReserve','demandDropPct','variableCostIncreasePct','supplierRecoveryDays','inventoryCoverDays','recoveryCost'];
 const stressRaw=Object.fromEntries(stressFields.map(name=>[name,form.elements.namedItem(name).value.trim()]));
 const stressCount=Object.values(stressRaw).filter(x=>x!=='').length;
 if(stressCount!==0&&stressCount!==6)throw Error('Enter all six continuity stress assumptions or leave every one blank.');
 if(stressCount>0&&!model)throw Error('Continuity stress requires the six unit-economics assumptions.');
 const continuity=stressCount===0?null:Object.fromEntries(stressFields.map(name=>[name,Number(stressRaw[name])]));
 return {id:$('case-id').value.trim(),title:$('case-title').value.trim(),
  market:$('case-market').value.trim(),asOf:$('as-of').value,
  evidence:currentReferences.map(x=>({...x})),model,continuity};
}
function showReport({report,markdown}){
 generated={report,markdown};
 const decision=report.recommendation;
 $('result').hidden=false;$('result-heading').textContent=report.title;
 $('decision-status').textContent=decision.status;
 $('decision-summary').textContent=decision.decision;
 $('unit-contribution').textContent=report.unitEconomics
  ?currency(report.unitEconomics.contributionPerUnit):'Not modelled';
 $('break-even').textContent=report.unitEconomics
  ?(report.unitEconomics.breakEvenUnits===null?'Not attainable':report.unitEconomics.breakEvenUnits+' units/mo'):'HOLD';
 $('source-total').textContent=String(report.evidence.length)+' referenced';
 $('case-markdown').textContent=markdown;
 const bars=$('scenario-bars');bars.replaceChildren();
 if(report.scenarios){
  const max=Math.max(1,...Object.values(report.scenarios).map(x=>Math.abs(x.operatingSurplus)));
  for(const name of ['bear','base','bull']){
   const x=report.scenarios[name],row=element('div',undefined,'scenario-row');
   row.append(element('span',name.toUpperCase()));
   const track=element('div',undefined,'bar-track'),fill=element('div',undefined,
    x.operatingSurplus<0?'bar-fill loss':'bar-fill');
   fill.style.width=(Math.abs(x.operatingSurplus)/max*100).toFixed(1)+'%';track.append(fill);
   row.append(track,element('strong',currency(x.operatingSurplus)));
   bars.append(row);
  }
  bars.prepend(element('p','Scenario-only operating surplus / month — excludes working capital, taxes and CAPEX','subtle'));
 }else bars.append(element('p','No model supplied: market claims need independent review and financial forecasts remain HOLD.','subtle'));
 const stress=report.continuityStress;
 $('continuity-panel').hidden=!stress;
 if(stress){
  $('continuity-outage').textContent=stress.modeledInterruptionDays+' of 30 days';
  $('continuity-surplus').textContent=currency(stress.firstMonthSurplus);
  $('continuity-runway').textContent=stress.cashCoverageMonths===null?
   'Not modeled (non-loss)':
   stress.cashCoverageMonths+' months';
  $('continuity-status').textContent=stress.fundingHold?
   'HOLD — one-time recovery cost exceeds assumed cash reserve. No financial action authorized.':
   'Stress scenario only: supplier recovery, inventory, demand, cash and costs are unverified inputs. No financial action authorized.';
 }
 $('export-case').disabled=false;
}
function resetGenerated(message){
 generated=null;lastInput=null;$('save-case').disabled=true;$('export-case').disabled=true;
 $('result').hidden=true;$('case-status').textContent=message;
}
async function refreshArchive(){
 $('archive-status').textContent='Looking for your saved research…';
 const list=$('archive-list');list.replaceChildren();
 try{
  const data=await api(API);
  const rows=(data.records||[]).slice().reverse();
  $('archive-status').textContent=rows.length+' archived study version(s)'+
   (data.partial?' (partial listing)':'');
  if(!rows.length)list.append(element('li','No saved research yet. Build a case study and save a version when you are ready.'));
  for(const record of rows){
   const li=element('li'),meta=element('span');
   meta.append(element('strong',record.id));
   meta.append(element('small',record.version));
   const button=element('button','Open');button.type='button';
   button.addEventListener('click',async()=>{
    $('archive-status').textContent='Reading archived version…';
    try{
     const stored=await api(API+'?id='+encodeURIComponent(record.id)+
      '&record='+encodeURIComponent(record.version));
     resetGenerated('Viewing saved research version. Source validation status is unchanged.');
     showReport(stored);$('archive-status').textContent='Loaded '+record.id+' / '+record.version;
     $('result').scrollIntoView({behavior:'smooth',block:'start'});
    }catch(e){$('archive-status').textContent='HOLD — '+e.message;}
   });
   li.append(meta,button);list.append(li);
  }
 }catch(e){$('archive-status').textContent='Archive HOLD — we could not load saved research. You can try again. (Code: '+e.message+')';}
}
async function scan(e){
 e.preventDefault();const list=$('signal-list');list.replaceChildren();
 const topic=$('scan-query').value.trim();
 $('scan-status').textContent='Checking recent public news for your topic…';
 try{
  const result=await api(API+'?q='+encodeURIComponent(topic));
  const context=result.context;
  $('scan-status').textContent=context.items.length+' contextual headline(s) · '+
   context.status+' · NOT verified market measurements';
  if(!context.items.length)list.append(element('li','No recent matching headlines were available. This is not evidence that market demand is zero.'));
  for(const item of context.items){
   const li=element('li'),anchor=element('a',item.title);
   anchor.href=item.url;anchor.rel='noopener noreferrer';anchor.target='_blank';
   li.append(anchor,element('small',item.publisher+' · '+item.published.slice(0,10)+
    ' · UNVERIFIED HEADLINE'));list.append(li);
  }
 }catch(err){$('scan-status').textContent='Public scan HOLD — we could not complete the news search. Try again later. (Code: '+err.message+')';}
}
async function generate(e){
 e.preventDefault();resetGenerated('Preparing scenario from entered assumptions and references…');
 $('generate-case').disabled=true;
 try{
  const request=inputs();
  const result=await api(API,{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({operation:'PREVIEW',case:request})});
  showReport(result);lastInput=request;$('save-case').disabled=false;
  $('case-status').textContent='Your draft is ready. The sources still need checking, and the financial figures use your assumptions. Nothing has been saved yet.';
 }catch(err){$('case-status').textContent='CASE HOLD — '+err.message;}
 finally{$('generate-case').disabled=false;}
}
async function save(){
 if(!lastInput||!generated)return;
 if(!confirm('Save an immutable founder-only research version to VAOS R2? This will NOT approve any business decision.'))return;
 $('save-case').disabled=true;$('case-status').textContent='Saving a separate version of your research…';
 try{
  const result=await api(API,{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({operation:'SAVE',case:lastInput,confirm:true})});
  $('case-status').textContent='Archived '+result.id+' version '+result.version+
   ' — market proof and forecast qualification remain HOLD.';
  await refreshArchive();
 }catch(err){$('case-status').textContent='ARCHIVE HOLD — we could not save this version. Your earlier saved versions are unchanged. (Code: '+err.message+')';}
 finally{$('save-case').disabled=false;}
}
function exportReport(){
 if(!generated)return;
 const blob=new Blob([generated.markdown],{type:'text/markdown;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=(generated.report.id||'market-case')+'.md';
 document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);
}
window.addEventListener('vaos:case-bridge-reference',event=>{
 const id=event?.detail?.id;
 if(!Object.hasOwn(internalCaseReferences,id))return;
 const record=internalCaseReferences[id];
 if(!currentReferences.some(x=>x.url===record.url))currentReferences.push({...record});
 showReferences();
 resetGenerated('Added '+id+' as a reference for your next draft. Its assumptions have not been independently checked.');
});
async function init(){
 try{
  const r=await fetch('/api/session',{credentials:'same-origin',cache:'no-store'});
  if(!r.ok){location.replace('/login');return;}
  $('mission').hidden=false;
  $('login-check').hidden=true;
  const indiaDay=new Date(Date.now()+330*60000).toISOString().slice(0,10);
  $('as-of').value=indiaDay;
  $('as-of').max=indiaDay;
  $('scan-form').addEventListener('submit',scan);
  $('case-form').addEventListener('submit',generate);
  $('save-case').addEventListener('click',save);
  $('export-case').addEventListener('click',exportReport);
  $('refresh-archive').addEventListener('click',refreshArchive);
  $('load-references').addEventListener('click',()=>{currentReferences=references.map(x=>({...x}));showReferences();resetGenerated('Official reference records selected. Re-run case preview.');});
  $('clear-references').addEventListener('click',()=>{currentReferences=[];showReferences();resetGenerated('Reference register cleared.');});
  $('load-illustration').addEventListener('click',()=>{
   const sample={sellingPrice:55000,variableCost:36000,monthlyFixedCost:200000,bear:6,base:12,bull:20};
   for(const [key,value]of Object.entries(sample))$('case-form').elements.namedItem(key).value=String(value);
   $('case-status').textContent='Example values added. They are for illustration only, not verified VYNDI supplier quotes, bill of materials or accounts.';
  });
  showReferences();await refreshArchive();
 }catch(err){$('login-check').textContent='VAOS session unavailable — '+err.message;}
}
init();
