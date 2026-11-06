/** Founder market observatory, read-only text-only rendering of public evidence. */
const $=id=>document.getElementById(id),API='/api/market-public-intelligence';
const el=(tag,text,className)=>{
 const x=document.createElement(tag);
 if(text!==undefined)x.textContent=String(text);
 if(className)x.className=className;
 return x;
};
const numeral=n=>new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(n);
const validLink=url=>{
 try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null}
 catch{return null}
};
async function request(method='GET',body){
 const response=await fetch(API,{method,credentials:'same-origin',cache:'no-store',
  ...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
 const envelope=await response.json().catch(()=>null);
 if(!response.ok)throw Error(envelope?.error?.code||'MARKET_SOURCE_UNAVAILABLE');
 return envelope.data.snapshot;
}
function renderBank(snapshot){
 const host=$('market-worldbank');host.replaceChildren();
 for(const [id,label] of [['gdp','Real GDP growth'],['inflation','Consumer inflation']]){
  const item=snapshot.evidence?.worldBank?.[id],row=el('div',undefined,'market-metric');
  const last=item?.series?.at(-1);
  row.append(el('strong',label),el('span',
   item?.status==='OBSERVED'&&last?numeral(last.value)+'% · '+last.year:'HOLD — no qualified observation'));
  if(item?.url){const a=el('a','World Bank source');a.href=validLink(item.url)||'#';a.target='_blank';a.rel='noopener noreferrer';row.append(a);}
  host.append(row);
 }
}
function renderTrade(snapshot){
 const host=$('market-comtrade');host.replaceChildren();
 const trade=snapshot.evidence?.comtrade,rows=trade?.observations||[];
 if(!rows.length){host.append(el('p','HOLD — no matching India HS 8712 import observation in the keyless preview.','subtle'));return;}
 for(const point of rows){
  const row=el('div',undefined,'market-metric');
  row.append(el('strong',String(point.year)),el('span','$'+numeral(point.valueUSD)+' USD'));
  if(validLink(point.sourceUrl)){const a=el('a','UN Comtrade source');a.href=point.sourceUrl;a.target='_blank';a.rel='noopener noreferrer';row.append(a);}
  host.append(row);
 }
}
function renderBacktests(snapshot){
 const host=$('market-indicator-backtests');host.replaceChildren();
 for(const [id,label] of [['gdp','India real GDP growth'],['inflation','India CPI inflation']]){
  const result=snapshot.indicatorBacktests?.[id],row=el('div',undefined,'market-metric');
  row.append(el('strong',label));
  row.append(el('span',result?.status==='BACKTESTED_INDICATOR_EXTRAPOLATION'?
   'Indicator-only '+result.nextYear+' extrapolation: '+numeral(result.nextValue)+'% · backtest MAE '+numeral(result.backtestMAE)+' percentage points ('+result.folds+' folds)':
   'HOLD — insufficient consecutive public observations'));
  host.append(row);
 }
}
function renderCompetitors(snapshot){
 const host=$('market-competitor-articles');host.replaceChildren();
 const list=snapshot.evidence?.competitors?.items||[];
 const delta=snapshot.competitorChanges;
 $('market-new-articles').textContent=delta?.initialBaseline?
  'FIRST MONITORING BASELINE':(delta?.newCount||0)+' NEW LINKS · UNVERIFIED';
 if(!list.length){host.append(el('li','HOLD — no recent qualified public competitor headlines.'));return;}
 for(const row of list.slice(0,15)){
  const li=el('li');li.append(el('strong',row.watchName+' · '+row.date));
  const url=validLink(row.url);
  if(url){const link=el('a',row.title);link.href=url;link.target='_blank';link.rel='noopener noreferrer';li.append(link);}
  li.append(el('small',row.publisher+' · Unverified news context · No confirmed price'));
  host.append(li);
 }
}
function show(snapshot){
 if(snapshot?.schemaVersion!=='VAOS_PUBLIC_MARKET_SNAPSHOT_V2')throw Error('MARKET_SNAPSHOT_FORMAT_HOLD');
 $('market-public-status').textContent='Evidence checked '+snapshot.collectedAt+
  ' · '+snapshot.status+' · NOT a qualified sales forecast · no commercial actions';
 renderBank(snapshot);renderTrade(snapshot);renderBacktests(snapshot);renderCompetitors(snapshot);
}
async function load(){
 $('market-public-status').textContent='Loading founder-only evidence snapshot…';
 try{show(await request())}
 catch(error){$('market-public-status').textContent='HOLD — '+error.message+
  '. Refresh to request a new official-source snapshot.';}
}
async function refresh(){
 if(!confirm('Refresh public World Bank, UN Comtrade and GDELT data? This creates a founder-only research snapshot and authorizes no commercial action.'))return;
 const button=$('market-public-refresh');button.disabled=true;
 $('market-public-status').textContent='Checking bounded official sources…';
 try{show(await request('POST',{operation:'REFRESH',confirm:true}))}
 catch(error){$('market-public-status').textContent='REFRESH HOLD — '+error.message}
 finally{button.disabled=false;}
}
$('market-public-load').addEventListener('click',load);
$('market-public-refresh').addEventListener('click',refresh);
load();
